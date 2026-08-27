// Live signal engine.
//
// What changed, and why (see docs/TRADING_SYSTEM_AUDIT.md and docs/EDGE_REPORT.md):
//
//  * Analysis runs on CLOSED candles only. The old engine consumed the forming
//    bar, so the same rules produced different answers at :05 and :55 of the same
//    hour and the stored history could not be replayed.
//  * Entries, stops and targets are built from the close of the bar the decision
//    was made on, not from a separately fetched real-time quote.
//  * The 0-100 number is an EVIDENCE SCORE and is never called a probability.
//    Long and short always sum to 100, so 50 means "no information", not "50%".
//  * Historical win rate, expectancy, profit factor and sample size are reported
//    separately, from quant/ backtests, and belong to the SETUP rather than to
//    this particular signal.
//  * Setups carry a tier assigned from OUT-OF-SAMPLE statistics only.
//  * The scalp tier is gone. Measured at -0.35R to -0.44R per trade across every
//    period tested, with t = -6.8 on the final test.
//
// Keep in sync with base44/shared/signalEngine.ts — quant/test/mirror.test.js enforces it.

import { computeIndicators, last } from "@/lib/indicators";
import { classifyStructure, emaTrendBias, findLevels, biasScore } from "@/lib/structure";
import { closedCandles, developingCandle } from "@/lib/marketFeed";
import { buildCalendar, newsRiskAt, sessionOf } from "@/lib/calendar";
import { EDGE_STATS } from "@/lib/edgeStats";

export const WEIGHTS = {
  trend: 25, structure: 25, momentum: 12, support_resistance: 13, price_action: 10, macro: 15,
};
const TF_TREND_WEIGHTS = { D1: 0.35, H4: 0.3, H1: 0.2, M15: 0.1, M5: 0.05 };
const TF_STRUCT_WEIGHTS = { D1: 0.4, H4: 0.35, H1: 0.25 };
const MIN_CANDLES = 60;
const SIGNAL_VALID_MS = 3_600_000;   // one H1 bar: re-evaluated on the next close

export function analyze(data, options = {}) {
  const now = options.now ?? data?.fetchedAt ?? Date.now();
  const gold = data?.gold;
  if (!gold || gold.status !== 'ok') {
    return { available: false, reason: 'Market data unavailable', verdict: EDGE_STATS.verdict };
  }

  // ---- closed-candle views of every timeframe ----
  const tf = {};
  for (const key of ['M5', 'M15', 'H1', 'H4', 'D1']) {
    const series = gold.timeframes?.[key];
    const candles = closedCandles(series);
    if (candles.length >= MIN_CANDLES) {
      const ind = computeIndicators(candles);
      tf[key] = {
        candles, ind,
        emaBias: emaTrendBias(candles, ind),
        structure: classifyStructure(candles),
        developing: developingCandle(series),
        stalenessBars: series.stalenessBars,
      };
    } else {
      tf[key] = null;
    }
  }
  if (!tf.H1 || !tf.D1) {
    return { available: false, reason: 'Not enough closed candles on H1/D1 to analyse', verdict: EDGE_STATS.verdict };
  }

  const h1 = tf.H1;
  const decisionBar = h1.candles[h1.candles.length - 1];
  const price = decisionBar.close;
  const referenceTime = decisionBar.closeTime;
  const atrH1 = last(h1.ind.atr14);
  const rsiH1 = last(h1.ind.rsi14);
  const macdHist = last(h1.ind.macd.histogram);
  if (atrH1 == null || !(atrH1 > 0)) {
    return { available: false, reason: 'ATR unavailable on H1', verdict: EDGE_STATS.verdict };
  }

  const levels = findLevels(tf.D1.candles, h1.candles, price);
  const events = buildCalendar(now - 86_400_000, now + 7 * 86_400_000, options.extraEvents ?? []);
  const newsRisk = newsRiskAt(events, now);
  const session = sessionOf(referenceTime);

  // ---- evidence components ----
  const reasonsFor = [], reasonsAgainst = [];
  const breakdown = {};
  let longTotal = 0;
  const add = (key, net, available = true) => {
    const max = WEIGHTS[key];
    const l = max * Math.max(0, Math.min(1, net));
    breakdown[key] = { long: l, short: max - l, max, available };
    longTotal += l;
  };

  let trendNet = 0, trendSeen = 0;
  for (const [k, w] of Object.entries(TF_TREND_WEIGHTS)) {
    if (!tf[k]) continue;
    trendSeen += w;
    if (tf[k].emaBias === 'bullish') trendNet += w;
    else if (tf[k].emaBias === 'bearish') trendNet -= w;
  }
  trendNet = trendSeen > 0 ? trendNet / trendSeen : 0;
  add('trend', (trendNet + 1) / 2);
  if (trendNet > 0.4) reasonsFor.push(`Higher-timeframe EMA trend is bullish (D1 ${tf.D1.emaBias}, H4 ${tf.H4?.emaBias ?? 'n/a'})`);
  if (trendNet < -0.4) reasonsFor.push(`Higher-timeframe EMA trend is bearish (D1 ${tf.D1.emaBias}, H4 ${tf.H4?.emaBias ?? 'n/a'})`);

  let structNet = 0, structSeen = 0;
  for (const [k, w] of Object.entries(TF_STRUCT_WEIGHTS)) {
    if (!tf[k]) continue;
    structSeen += w;
    structNet += biasScore(tf[k].structure.bias) * w;
  }
  structNet = structSeen > 0 ? structNet / structSeen : 0.5;
  add('structure', structNet);
  if (structNet > 0.65) reasonsFor.push(`Bullish swing structure on H1: ${h1.structure.detail}`);
  if (structNet < 0.35) reasonsFor.push(`Bearish swing structure on H1: ${h1.structure.detail}`);

  let momentumNet = 0.5;
  if (rsiH1 != null) momentumNet += (rsiH1 - 50) / 100;
  if (macdHist != null) momentumNet += Math.max(-0.2, Math.min(0.2, macdHist / atrH1 / 2));
  add('momentum', momentumNet);
  if (rsiH1 != null && rsiH1 > 70) reasonsAgainst.push(`H1 RSI is stretched at ${rsiH1.toFixed(0)} — pullback risk`);
  if (rsiH1 != null && rsiH1 < 30) reasonsAgainst.push(`H1 RSI is oversold at ${rsiH1.toFixed(0)} — bounce risk`);

  let srNet = 0.5;
  const nearestSup = levels.supports[0], nearestRes = levels.resistances[0];
  let distSupAtr = null, distResAtr = null;
  if (nearestSup && nearestRes) {
    distSupAtr = (price - nearestSup.price) / atrH1;
    distResAtr = (nearestRes.price - price) / atrH1;
    if (distResAtr < 0.6) { srNet -= 0.3; reasonsAgainst.push(`Price is within ${distResAtr.toFixed(1)} ATR of resistance at ${nearestRes.price.toFixed(0)} (${nearestRes.label})`); }
    if (distSupAtr < 0.6) { srNet += 0.3; reasonsFor.push(`Price is holding just above support at ${nearestSup.price.toFixed(0)} (${nearestSup.label})`); }
    if (distResAtr > 2 && distSupAtr > 1) srNet += 0.1;
  }
  add('support_resistance', srNet);

  let paNet = 0.5;
  if (h1.structure.bos === 'bullish_bos') { paNet += 0.25; reasonsFor.push('H1 break of structure to the upside'); }
  if (h1.structure.bos === 'bearish_bos') { paNet -= 0.25; reasonsFor.push('H1 break of structure to the downside'); }
  const m15Bias = tf.M15?.structure.bias;
  if (m15Bias === 'bullish' || m15Bias === 'lean_bullish') paNet += 0.15;
  if (m15Bias === 'bearish' || m15Bias === 'lean_bearish') paNet -= 0.15;
  add('price_action', paNet);

  // Macro is retained for transparency but is measured, not assumed: removing it
  // was the only single-component change that improved the score engine on the
  // development period, and that improvement did not survive out of sample.
  const dxyTrend = trendOf(data.dxy, 10, now);
  const yieldTrend = trendOf(data.us10y, 10, now);
  let macroNet = 0.5;
  if (dxyTrend) {
    if (dxyTrend.direction === 'down') { macroNet += 0.25; reasonsFor.push(`DXY has weakened ${Math.abs(dxyTrend.pct).toFixed(1)}% over 10 sessions — supportive for gold`); }
    if (dxyTrend.direction === 'up') { macroNet -= 0.25; reasonsAgainst.push(`DXY has strengthened ${dxyTrend.pct.toFixed(1)}% over 10 sessions — headwind for gold`); }
  }
  if (yieldTrend) {
    if (yieldTrend.direction === 'down') { macroNet += 0.2; reasonsFor.push('US 10Y yield declining — supportive for gold'); }
    if (yieldTrend.direction === 'up') { macroNet -= 0.2; reasonsAgainst.push('US 10Y yield rising — headwind for gold'); }
  }
  add('macro', macroNet, dxyTrend != null || yieldTrend != null);

  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  const longScore = Math.round(longTotal);
  const shortScore = total - longScore;

  const dirs = Object.values(breakdown).map((b) => b.long / b.max - 0.5);
  const bulls = dirs.filter((d) => d > 0.12).length, bears = dirs.filter((d) => d < -0.12).length;
  const conflict = bulls > 0 && bears > 0 ? (Math.min(bulls, bears) >= 2 ? 'HIGH' : 'MODERATE') : 'LOW';
  if (conflict === 'HIGH') reasonsAgainst.push('Bullish and bearish evidence are both strong — the components disagree');

  // ---- regime ----
  const atrSeries = h1.ind.atr14.filter((v) => v != null);
  const atrMean = atrSeries.length ? atrSeries.slice(-60).reduce((a, b) => a + b, 0) / Math.min(60, atrSeries.length) : null;
  const volRatio = atrMean ? atrH1 / atrMean : null;
  const regime = classifyRegime({
    d1: tf.D1.emaBias, h4: tf.H4?.emaBias, h1: h1.emaBias,
    d1StructBias: tf.D1.structure.bias, volRatio, inNews: newsRisk.level === 'HIGH',
  });

  // ---- setups ----
  const features = {
    d1Bias: tf.D1.emaBias, h4Bias: tf.H4?.emaBias, h1Bias: h1.emaBias,
    rsiH1, atrH1, volRatio,
  };
  const detected = detectSetups({ h1, features, levels, price });
  const setups = detected.map((s) => {
    const plan = buildPlan({
      price, direction: s.direction, atr: atrH1, levels,
      swingLow: h1.structure.lastSwingLow?.price,
      swingHigh: h1.structure.lastSwingHigh?.price,
    });
    const stats = EDGE_STATS.measured.setups[s.id] ?? null;
    return {
      ...s,
      plan,
      tier: stats?.tier ?? 'NO_TRADE',
      tierReason: stats?.tierReason ?? stats?.reason ?? 'No measured history.',
      evidence: s.direction === 'LONG' ? longScore : shortScore,
      // These belong to the SETUP's measured history, not to this signal.
      history: stats
        ? {
            outOfSample: stats.outOfSample,
            development: stats.development,
            validation: stats.validation,
            finalTest: stats.finalTest,
          }
        : null,
      expectedValueR: stats?.outOfSample?.expectancy ?? null,
      invalidation: plan
        ? `${s.direction} invalidated on an H1 close ${s.direction === 'LONG' ? 'below' : 'above'} ${plan.sl.toFixed(1)}`
        : null,
    };
  });

  // The primary signal is the highest-tier setup with a usable plan. A setup the
  // statistics rate NO_TRADE is not shown as an opportunity.
  const TIER_RANK = { 'A+': 0, A: 1, B: 2, C: 3, NO_TRADE: 4 };
  const tradable = setups.filter((s) => s.plan && s.tier !== 'NO_TRADE');
  tradable.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || (b.expectedValueR ?? -9) - (a.expectedValueR ?? -9));
  const primary = tradable[0] ?? null;

  if (setups.length > 0 && tradable.length === 0) {
    reasonsAgainst.push(`${setups.length} setup condition(s) hold, but none of them has measured evidence above the NO_TRADE threshold`);
  }

  return {
    available: true,
    verdict: EDGE_STATS.verdict,
    gating: EDGE_STATS.gating,
    dataQuality: {
      source: gold.source,
      symbol: gold.symbol,
      timezone: 'UTC',
      referenceTime,
      referenceBarState: 'CLOSED',
      developingBarOpenTime: h1.developing?.openTime ?? null,
      stalenessBars: h1.stalenessBars,
      fetchedAt: gold.fetchedAt,
    },
    price,
    livePrice: gold.livePrice ?? null,
    priceDrift: gold.livePrice != null ? gold.livePrice - price : null,
    evidence: { longScore, shortScore, directionalEdge: longScore - shortScore, breakdown, conflict },
    // Legacy field names the existing UI still reads. Same numbers, honest names above.
    longScore, shortScore, breakdown, conflict,
    direction: primary?.direction ?? 'NO_TRADE',
    regime: regime.regime,
    volState: regime.volState,
    volRatio,
    session,
    newsRisk,
    atrH1, rsiH1,
    levels,
    setups,
    primary,
    setup: primary?.plan ?? null,
    signalValidUntil: referenceTime + SIGNAL_VALID_MS,
    timeframeBias: Object.fromEntries(['D1', 'H4', 'H1', 'M15', 'M5'].map((k) => [k, tf[k]?.emaBias?.toUpperCase() ?? 'N/A'])),
    reasonsFor, reasonsAgainst,
    tf,
  };
}

/** Regime label plus an orthogonal volatility state, so the two can be crossed. */
export function classifyRegime({ d1, h4, h1, d1StructBias, volRatio, inNews }) {
  const volState = volRatio == null ? 'NORMAL' : volRatio > 1.5 ? 'HIGH' : volRatio < 0.65 ? 'LOW' : 'NORMAL';
  let regime = 'UNCERTAIN';
  if (d1 === 'bullish' && h4 === 'bullish' && h1 === 'bullish') regime = 'TRENDING_BULLISH';
  else if (d1 === 'bearish' && h4 === 'bearish' && h1 === 'bearish') regime = 'TRENDING_BEARISH';
  else if (d1 === 'bullish' && (h1 === 'bearish' || h1 === 'neutral')) regime = 'PULLBACK_BULLISH';
  else if (d1 === 'bearish' && (h1 === 'bullish' || h1 === 'neutral')) regime = 'PULLBACK_BEARISH';
  else if (d1 === 'neutral' && h4 === 'neutral' && h1 === 'neutral') regime = 'RANGE';
  else if (h4 === 'neutral' && h1 === 'neutral' && (d1StructBias === 'neutral' || d1StructBias == null)) regime = 'RANGE';

  if (regime === 'UNCERTAIN' || regime === 'RANGE') {
    if (inNews) regime = 'NEWS_EVENT';
    else if (volState === 'HIGH') regime = 'HIGH_VOLATILITY';
    else if (volState === 'LOW' && regime === 'UNCERTAIN') regime = 'LOW_VOLATILITY';
  }
  return { regime, volState };
}

const SETUP_CFG = {
  pullbackWindow: 12, breakoutWindow: 20,
  rsiOverbought: 75, rsiOversold: 25, revRsiLong: 45, revRsiShort: 55,
  levelProximityAtr: 0.6, levelTestAtr: 0.25, minLevelWeight: 2,
  volMin: 0.7, volMax: 2.0,
};

/**
 * The same eight setup definitions the backtester measured. Any change here must
 * be mirrored in quant/src/core/setups.js and the statistics regenerated, or the
 * numbers on screen stop describing the rules on screen.
 */
export function detectSetups({ h1, features, levels, price, cfg = SETUP_CFG }) {
  const c = h1.candles[h1.candles.length - 1];
  const i = h1.candles.length - 1;
  const ema20 = h1.ind.ema20;
  const e20 = ema20[i];
  const atr = features.atrH1;
  if (e20 == null || atr == null) return [];

  const bullBar = c.close > c.open, bearBar = c.close < c.open;
  const { d1Bias, h4Bias, h1Bias, rsiH1, volRatio } = features;
  const volOk = volRatio == null || (volRatio >= cfg.volMin && volRatio <= cfg.volMax);
  const out = [];

  const dipped = (side) => {
    for (let k = Math.max(0, i - cfg.pullbackWindow); k <= i; k++) {
      const e = ema20[k];
      if (e == null) continue;
      if (side === 'long' && h1.candles[k].low <= e) return true;
      if (side === 'short' && h1.candles[k].high >= e) return true;
    }
    return false;
  };

  if (d1Bias === 'bullish' && h4Bias === 'bullish' && h1Bias === 'bullish' && dipped('long')
      && price > e20 && bullBar && (rsiH1 == null || rsiH1 < cfg.rsiOverbought)) {
    out.push({ id: 'A_TREND_CONT_LONG', name: 'Trend Continuation Long', direction: 'LONG' });
  }
  if (d1Bias === 'bearish' && h4Bias === 'bearish' && h1Bias === 'bearish' && dipped('short')
      && price < e20 && bearBar && (rsiH1 == null || rsiH1 > cfg.rsiOversold)) {
    out.push({ id: 'B_TREND_CONT_SHORT', name: 'Trend Continuation Short', direction: 'SHORT' });
  }
  if (d1Bias === 'bullish' && (h4Bias === 'bullish' || h4Bias === 'neutral') && h1Bias !== 'bullish'
      && dipped('long') && price > e20 && bullBar) {
    out.push({ id: 'C_PULLBACK_LONG', name: 'Bullish Pullback', direction: 'LONG' });
  }
  if (d1Bias === 'bearish' && (h4Bias === 'bearish' || h4Bias === 'neutral') && h1Bias !== 'bearish'
      && dipped('short') && price < e20 && bearBar) {
    out.push({ id: 'D_PULLBACK_SHORT', name: 'Bearish Pullback', direction: 'SHORT' });
  }

  const sup = levels.supports.find((l) => l.weight >= cfg.minLevelWeight);
  const res = levels.resistances.find((l) => l.weight >= cfg.minLevelWeight);
  if (d1Bias !== 'bearish' && sup && bullBar && (price - sup.price) / atr < cfg.levelProximityAtr
      && c.low <= sup.price + cfg.levelTestAtr * atr && c.close > sup.price
      && (rsiH1 == null || rsiH1 < cfg.revRsiLong)) {
    out.push({ id: 'E_RANGE_REV_LONG', name: 'Range Reversal Long', direction: 'LONG' });
  }
  if (d1Bias !== 'bullish' && res && bearBar && (res.price - price) / atr < cfg.levelProximityAtr
      && c.high >= res.price - cfg.levelTestAtr * atr && c.close < res.price
      && (rsiH1 == null || rsiH1 > cfg.revRsiShort)) {
    out.push({ id: 'F_RANGE_REV_SHORT', name: 'Range Reversal Short', direction: 'SHORT' });
  }

  if (i >= cfg.breakoutWindow && volOk) {
    let hi = -Infinity, lo = Infinity;
    for (let k = i - cfg.breakoutWindow; k < i; k++) {
      hi = Math.max(hi, h1.candles[k].high);
      lo = Math.min(lo, h1.candles[k].low);
    }
    if (d1Bias !== 'bearish' && price > hi && bullBar) out.push({ id: 'G_BREAKOUT_LONG', name: 'Breakout Long', direction: 'LONG' });
    if (d1Bias !== 'bullish' && price < lo && bearBar) out.push({ id: 'H_BREAKOUT_SHORT', name: 'Breakout Short', direction: 'SHORT' });
  }

  return out;
}

/**
 * Stop and targets, matching the policy the published statistics were measured
 * under: structure stop with an ATR buffer, floored and capped, and fixed 1R/2R/3R
 * targets. The old "farthest level, floored at 5R" construction is gone — only
 * 0.9% of historical trades ever reached 4R, so it produced a headline number
 * that the market almost never paid.
 */
export function buildPlan({ price, direction, atr, levels, swingLow, swingHigh,
                            swingBufferAtr = 0.3, minStopAtr = 0.6, maxStopAtr = 2.5,
                            rMultiples = [1, 2, 3] }) {
  const isLong = direction === 'LONG';
  const buf = swingBufferAtr * atr, floor = minStopAtr * atr, cap = maxStopAtr * atr;
  let sl;
  if (isLong) {
    const s = swingLow != null && swingLow < price ? swingLow - buf : price - cap;
    sl = Math.max(Math.min(s, price - floor), price - cap);
  } else {
    const s = swingHigh != null && swingHigh > price ? swingHigh + buf : price + cap;
    sl = Math.min(Math.max(s, price + floor), price + cap);
  }
  const risk = Math.abs(price - sl);
  if (!(risk > 0)) return null;
  const sign = isLong ? 1 : -1;
  const [tp1, tp2, tp3] = rMultiples.map((m) => price + sign * risk * m);
  return {
    entry: price, sl, risk, tp1, tp2, tp3,
    rr1: rMultiples[0], rr2: rMultiples[1], rr3: rMultiples[2],
    stopPolicy: 'structure_atr', targetPolicy: `fixedR ${rMultiples.join('/')}`,
  };
}

function trendOf(series, lookback = 10, now = Date.now()) {
  const candles = closedCandles(series);
  if (candles.length < lookback + 1) return null;
  const nowClose = candles[candles.length - 1].close;
  const then = candles[candles.length - 1 - lookback].close;
  const pct = ((nowClose - then) / then) * 100;
  return { pct, direction: pct > 0.3 ? 'up' : pct < -0.3 ? 'down' : 'flat' };
}
