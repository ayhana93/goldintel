// Phase 6 — explicit, testable setup definitions.
//
// The production system treats a 0-100 score AS the strategy. That makes it
// impossible to say which market behaviour is being exploited, so it is also
// impossible to say which part has an edge. Here each setup is a named, falsifiable
// condition set evaluated on CLOSED bars only. Setups decide direction; stop and
// target policies (stops.js / targets.js) decide levels, so Phase 11 and 12 can
// vary levels without changing what a setup means.
//
// No claim is made that any of these work. The backtester decides.

import { scoreEvidence } from './evidence.js';

export const SETUP_IDS = [
  'A_TREND_CONT_LONG', 'B_TREND_CONT_SHORT',
  'C_PULLBACK_LONG', 'D_PULLBACK_SHORT',
  'E_RANGE_REV_LONG', 'F_RANGE_REV_SHORT',
  'G_BREAKOUT_LONG', 'H_BREAKOUT_SHORT',
];

const DEFAULTS = {
  pullbackWindow: 12,      // bars in which the dip to the mean must have happened
  breakoutWindow: 20,      // lookback for the range being broken
  rsiOverbought: 75,
  rsiOversold: 25,
  revRsiLong: 45,
  revRsiShort: 55,
  levelProximityAtr: 0.6,  // how close to a level counts as "at" it
  levelTestAtr: 0.25,      // how deep into the level the wick must probe
  minLevelWeight: 2,
  volMin: 0.7,
  volMax: 2.0,
};

/** Highest high / lowest low of the `n` bars ending just before index i. */
function priorRange(candles, i, n) {
  let hi = -Infinity, lo = Infinity;
  const from = Math.max(0, i - n);
  for (let k = from; k < i; k++) {
    if (candles[k].high > hi) hi = candles[k].high;
    if (candles[k].low < lo) lo = candles[k].low;
  }
  return { hi, lo, bars: i - from };
}

/** Did price dip to or below the fast mean within the recent window? */
function dippedToMean(candles, ema20, i, window, side) {
  const from = Math.max(0, i - window);
  for (let k = from; k <= i; k++) {
    const e = ema20[k];
    if (e == null) continue;
    if (side === 'long' && candles[k].low <= e) return true;
    if (side === 'short' && candles[k].high >= e) return true;
  }
  return false;
}

/**
 * Evaluate every setup at H1 bar `i`.
 * Returns the list of setups whose conditions hold. More than one may fire;
 * the strategy layer decides how to arbitrate.
 */
export function detectSetups({ ctx, idx, features, levels, cfg = {} }) {
  const p = { ...DEFAULTS, ...cfg };
  const h1 = ctx.tf.H1;
  const i = idx.H1;
  if (i < 0) return [];
  const c = h1.candles[i];
  const ema20 = h1.ind.ema20;
  const e20 = ema20[i];
  const price = c.close;
  const atr = features.atrH1;
  if (atr == null || e20 == null) return [];

  const bullBar = c.close > c.open;
  const bearBar = c.close < c.open;
  const { d1Bias, h4Bias, h1Bias, rsiH1, volRatio } = features;
  const volOk = volRatio == null || (volRatio >= p.volMin && volRatio <= p.volMax);
  const out = [];

  // --- A / B: continuation inside an aligned trend, after a dip to the mean ---
  if (d1Bias === 'bullish' && h4Bias === 'bullish' && h1Bias === 'bullish'
      && dippedToMean(h1.candles, ema20, i, p.pullbackWindow, 'long')
      && price > e20 && bullBar
      && (rsiH1 == null || rsiH1 < p.rsiOverbought)) {
    out.push({ id: 'A_TREND_CONT_LONG', direction: 'LONG', tier: 'swing' });
  }
  if (d1Bias === 'bearish' && h4Bias === 'bearish' && h1Bias === 'bearish'
      && dippedToMean(h1.candles, ema20, i, p.pullbackWindow, 'short')
      && price < e20 && bearBar
      && (rsiH1 == null || rsiH1 > p.rsiOversold)) {
    out.push({ id: 'B_TREND_CONT_SHORT', direction: 'SHORT', tier: 'swing' });
  }

  // --- C / D: deeper pullback — higher timeframe still directional, H1 is not ---
  if (d1Bias === 'bullish' && (h4Bias === 'bullish' || h4Bias === 'neutral')
      && h1Bias !== 'bullish'
      && dippedToMean(h1.candles, ema20, i, p.pullbackWindow, 'long')
      && price > e20 && bullBar) {
    out.push({ id: 'C_PULLBACK_LONG', direction: 'LONG', tier: 'swing' });
  }
  if (d1Bias === 'bearish' && (h4Bias === 'bearish' || h4Bias === 'neutral')
      && h1Bias !== 'bearish'
      && dippedToMean(h1.candles, ema20, i, p.pullbackWindow, 'short')
      && price < e20 && bearBar) {
    out.push({ id: 'D_PULLBACK_SHORT', direction: 'SHORT', tier: 'swing' });
  }

  // --- E / F: reversal at a validated range boundary ---
  const sup = levels.supports.find((l) => l.weight >= p.minLevelWeight);
  const res = levels.resistances.find((l) => l.weight >= p.minLevelWeight);
  if (d1Bias !== 'bearish' && sup && bullBar
      && (price - sup.price) / atr < p.levelProximityAtr
      && c.low <= sup.price + p.levelTestAtr * atr
      && c.close > sup.price
      && (rsiH1 == null || rsiH1 < p.revRsiLong)) {
    out.push({ id: 'E_RANGE_REV_LONG', direction: 'LONG', tier: 'swing' });
  }
  if (d1Bias !== 'bullish' && res && bearBar
      && (res.price - price) / atr < p.levelProximityAtr
      && c.high >= res.price - p.levelTestAtr * atr
      && c.close < res.price
      && (rsiH1 == null || rsiH1 > p.revRsiShort)) {
    out.push({ id: 'F_RANGE_REV_SHORT', direction: 'SHORT', tier: 'swing' });
  }

  // --- G / H: breakout of the recent range, with volatility inside a sane band ---
  const range = priorRange(h1.candles, i, p.breakoutWindow);
  if (range.bars >= p.breakoutWindow && volOk) {
    if (d1Bias !== 'bearish' && price > range.hi && bullBar) {
      out.push({ id: 'G_BREAKOUT_LONG', direction: 'LONG', tier: 'swing' });
    }
    if (d1Bias !== 'bullish' && price < range.lo && bearBar) {
      out.push({ id: 'H_BREAKOUT_SHORT', direction: 'SHORT', tier: 'swing' });
    }
  }

  return out;
}

/**
 * The production strategy, reproduced faithfully: score the evidence, and take a
 * trade when the winning side clears the threshold. Kept as BASELINE so every
 * later change is measured against what the app does today.
 */
export function baselineDecision({ features, cfg = {} }) {
  const { threshold = 70, weights, blockOnHighConflict = true } = cfg;
  const ev = scoreEvidence({ features, weights });
  let direction = 'NO_TRADE';
  if (ev.longScore >= threshold) direction = 'LONG';
  else if (ev.shortScore >= threshold) direction = 'SHORT';
  if (blockOnHighConflict && ev.conflict === 'HIGH') {
    const penalised = Math.max(ev.longScore, ev.shortScore) - 10;
    if (penalised < threshold) direction = 'NO_TRADE';
  }
  return { direction, ...ev };
}

/** Scalp variant of the production engine: lower threshold, M15 alignment filter. */
export function baselineScalpDecision({ ctx, idx, features, cfg = {} }) {
  const { threshold = 58, weights } = cfg;
  const ev = scoreEvidence({ features, weights });
  let direction = 'NO_TRADE';
  if (ev.longScore >= threshold) direction = 'LONG';
  else if (ev.shortScore >= threshold) direction = 'SHORT';
  if (direction === 'NO_TRADE' || ev.conflict === 'HIGH') return { direction: 'NO_TRADE', ...ev };

  const m15 = ctx.tf.M15, iM15 = idx.M15;
  const m15Bias = m15 && iM15 >= 0 ? m15.emaBias[iM15] : null;
  const aligned = direction === 'LONG'
    ? (m15Bias === 'bullish' || m15Bias === 'neutral')
    : (m15Bias === 'bearish' || m15Bias === 'neutral');
  return { direction: aligned ? direction : 'NO_TRADE', ...ev };
}

export { DEFAULTS as SETUP_DEFAULTS };
