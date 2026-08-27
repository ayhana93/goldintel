// Phase 8 / Phase 24 — the evidence score.
//
// This is a SCORE, not a probability. It is never presented as one. The
// historical win rate of a setup is measured separately, empirically, and the
// two numbers are reported side by side and never conflated.
//
// The baseline weights and rules are a faithful reproduction of the production
// engine so that the backtest measures what the app actually does. Everything is
// driven by a config object so Phase 27/28 can vary it reproducibly.

import { biasScore } from './structure.js';
import { rollingMeanAt } from './indicators.js';

export const BASELINE_WEIGHTS = {
  trend: 25, structure: 25, momentum: 12, support_resistance: 13, price_action: 10, macro: 15,
};

export const TF_TREND_WEIGHTS = { D1: 0.35, H4: 0.3, H1: 0.2, M15: 0.1, M5: 0.05 };
export const TF_STRUCT_WEIGHTS = { D1: 0.4, H4: 0.35, H1: 0.25 };

/**
 * Compute the long/short evidence split.
 *
 * NOTE ON THE SCALE: every component contributes x to long and (max - x) to
 * short, so longScore + shortScore is identically 100. A "score of 50" therefore
 * means no directional information at all, not "50% likely". The production code
 * additionally gated on `long - short >= 15`, which under this identity reduces
 * to `long >= 57.5` and is strictly implied by its own `long >= 70` threshold —
 * i.e. it never bound. `directionalEdge` below is the honest version of that
 * quantity: the signed distance from a coin flip, on a -100..+100 scale.
 */
export function scoreEvidence({ features, weights = BASELINE_WEIGHTS }) {
  const breakdown = {};
  let long = 0;
  const add = (key, net, available = true) => {
    const max = weights[key] ?? 0;
    const l = max * Math.max(0, Math.min(1, net));
    breakdown[key] = { long: l, short: max - l, max, net, available };
    long += l;
  };

  add('trend', (features.trendNet + 1) / 2);
  add('structure', features.structNet);
  add('momentum', features.momentumNet);
  add('support_resistance', features.srNet);
  add('price_action', features.paNet);
  add('macro', features.macroNet, features.macroAvailable);

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const short = total - long;

  const dirs = Object.values(breakdown).map((b) => (b.max ? b.long / b.max - 0.5 : 0));
  const bulls = dirs.filter((d) => d > 0.12).length;
  const bears = dirs.filter((d) => d < -0.12).length;
  const conflict = bulls > 0 && bears > 0 ? (Math.min(bulls, bears) >= 2 ? 'HIGH' : 'MODERATE') : 'LOW';

  return {
    longScore: long,
    shortScore: short,
    directionalEdge: long - short,   // -100..+100, 0 = no information
    breakdown,
    conflict,
  };
}

/** Build the feature vector for one decision instant, from closed bars only. */
export function buildFeatures({ ctx, idx, price, levels, cfg = {} }) {
  const { trendTfWeights = TF_TREND_WEIGHTS, structTfWeights = TF_STRUCT_WEIGHTS,
          srAtrProximity = 0.6, macroLookback = 10, macroPctThreshold = 0.3,
          useMacro = true, useMomentum = true } = cfg;

  // --- Trend: multi-timeframe EMA alignment ---
  let trendNet = 0, trendWeightSeen = 0;
  for (const [tfName, w] of Object.entries(trendTfWeights)) {
    const tfCtx = ctx.tf[tfName];
    const i = idx[tfName];
    if (!tfCtx || i == null || i < 0) continue;
    trendWeightSeen += w;
    const bias = tfCtx.emaBias[i];
    if (bias === 'bullish') trendNet += w;
    else if (bias === 'bearish') trendNet -= w;
  }
  if (trendWeightSeen > 0) trendNet /= trendWeightSeen;   // renormalize when a TF is missing

  // --- Structure: swing structure across timeframes ---
  let structNet = 0, structWeightSeen = 0;
  for (const [tfName, w] of Object.entries(structTfWeights)) {
    const tfCtx = ctx.tf[tfName];
    const i = idx[tfName];
    if (!tfCtx || i == null || i < 0) continue;
    structWeightSeen += w;
    structNet += biasScore(tfCtx.struct[i].bias) * w;
  }
  structNet = structWeightSeen > 0 ? structNet / structWeightSeen : 0.5;

  // --- Momentum: RSI + MACD histogram normalized by ATR ---
  const h1 = ctx.tf.H1, iH1 = idx.H1;
  const rsiH1 = iH1 >= 0 ? h1.ind.rsi14[iH1] : null;
  const macdHist = iH1 >= 0 ? h1.ind.macd.histogram[iH1] : null;
  const atrH1 = iH1 >= 0 ? h1.ind.atr14[iH1] : null;
  let momentumNet = 0.5;
  if (useMomentum) {
    if (rsiH1 != null) momentumNet += (rsiH1 - 50) / 100;
    if (macdHist != null && atrH1) momentumNet += Math.max(-0.2, Math.min(0.2, macdHist / atrH1 / 2));
    momentumNet = Math.max(0, Math.min(1, momentumNet));
  }

  // --- Support / resistance location ---
  let srNet = 0.5;
  const nearestSup = levels?.supports?.[0], nearestRes = levels?.resistances?.[0];
  let distToSupAtr = null, distToResAtr = null;
  if (atrH1 && nearestSup && nearestRes) {
    distToSupAtr = (price - nearestSup.price) / atrH1;
    distToResAtr = (nearestRes.price - price) / atrH1;
    if (distToResAtr < srAtrProximity) srNet -= 0.3;
    if (distToSupAtr < srAtrProximity) srNet += 0.3;
    if (distToResAtr > 2 && distToSupAtr > 1) srNet += 0.1;
    srNet = Math.max(0, Math.min(1, srNet));
  }

  // --- Price action: BOS + lower-timeframe structure agreement ---
  let paNet = 0.5;
  const bos = iH1 >= 0 ? h1.struct[iH1].bos : null;
  if (bos === 'bullish_bos') paNet += 0.25;
  if (bos === 'bearish_bos') paNet -= 0.25;
  const m15 = ctx.tf.M15, iM15 = idx.M15;
  const m15Bias = m15 && iM15 >= 0 ? m15.struct[iM15].bias : null;
  if (m15Bias === 'bullish' || m15Bias === 'lean_bullish') paNet += 0.15;
  if (m15Bias === 'bearish' || m15Bias === 'lean_bearish') paNet -= 0.15;
  paNet = Math.max(0, Math.min(1, paNet));

  // --- Macro: dollar index direction (inverse for gold) ---
  let macroNet = 0.5, macroAvailable = false;
  if (useMacro && ctx.macro.dxy) {
    const mi = ctx.macro.dxy.fromH1 ? ctx.macro.dxy.fromH1[iH1] : -1;
    const mc = ctx.macro.dxy.candles;
    if (mi >= macroLookback) {
      const now = mc[mi].close, then = mc[mi - macroLookback].close;
      const pct = ((now - then) / then) * 100;
      macroAvailable = true;
      if (pct < -macroPctThreshold) macroNet += 0.25;
      else if (pct > macroPctThreshold) macroNet -= 0.25;
      macroNet = Math.max(0, Math.min(1, macroNet));
    }
  }

  return {
    trendNet, structNet, momentumNet, srNet, paNet, macroNet, macroAvailable,
    rsiH1, macdHist, atrH1, bos, m15Bias,
    distToSupAtr, distToResAtr,
    h1Bias: iH1 >= 0 ? h1.emaBias[iH1] : null,
    h4Bias: ctx.tf.H4 && idx.H4 >= 0 ? ctx.tf.H4.emaBias[idx.H4] : null,
    d1Bias: ctx.tf.D1 && idx.D1 >= 0 ? ctx.tf.D1.emaBias[idx.D1] : null,
    h1Struct: iH1 >= 0 ? h1.struct[iH1] : null,
    h4Struct: ctx.tf.H4 && idx.H4 >= 0 ? ctx.tf.H4.struct[idx.H4] : null,
    d1Struct: ctx.tf.D1 && idx.D1 >= 0 ? ctx.tf.D1.struct[idx.D1] : null,
    volRatio: iH1 >= 0 && atrH1 ? atrH1 / (rollingMeanAt(h1.ind.atr14, iH1, 60) || atrH1) : null,
  };
}
