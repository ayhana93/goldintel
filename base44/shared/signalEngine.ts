// Deterministic evidence-scoring signal engine for XAU/USD.
// Produces LONG / SHORT / NO_TRADE from structured features. No fabricated probabilities.
// Server-side mirror of src/lib/signalEngine.js — keep in sync.

import { computeIndicators, last } from "./indicators.ts";
import { classifyStructure, emaTrendBias, findLevels } from "./structure.ts";

const WEIGHTS = {
  trend: 25,            // multi-timeframe EMA trend alignment
  structure: 25,        // swing structure (HH/HL vs LH/LL)
  momentum: 12,         // RSI + MACD
  support_resistance: 13, // location relative to key levels
  price_action: 10,     // BOS / recent close behavior
  macro: 15,            // DXY + US10Y direction (inverse for gold)
};

function trendOf(series, lookback = 10) {
  if (!series || series.status !== "ok" || series.candles.length < lookback + 1) return null;
  const c = series.candles;
  const now = c[c.length - 1].close, prev = c[c.length - 1 - lookback].close;
  const pct = ((now - prev) / prev) * 100;
  return { pct, direction: pct > 0.3 ? "up" : pct < -0.3 ? "down" : "flat" };
}

export function analyze(data) {
  const gold = data?.gold;
  if (!gold || gold.status !== "ok") return { available: false };

  const tf = {};
  for (const key of ["M5", "M15", "H1", "H4", "D1"]) {
    const series = gold.timeframes[key];
    if (series?.status === "ok" && series.candles.length >= 30) {
      const ind = computeIndicators(series.candles);
      tf[key] = {
        candles: series.candles,
        ind,
        emaBias: emaTrendBias(series.candles, ind),
        structure: classifyStructure(series.candles),
      };
    } else {
      tf[key] = null;
    }
  }
  if (!tf.H1 || !tf.D1) return { available: false };

  const price = gold.price;
  const levels = findLevels(tf.D1.candles, tf.H1.candles, price);
  const atrH1 = last(tf.H1.ind.atr14);
  const rsiH1 = last(tf.H1.ind.rsi14);
  const macdH1 = tf.H1.ind.macd;
  const macdHist = last(macdH1.histogram);

  const reasonsFor = [], reasonsAgainst = [];
  let long = 0, short = 0;
  const breakdown = {};

  // --- Trend (multi-timeframe EMA alignment) ---
  const tfWeights = { D1: 0.35, H4: 0.3, H1: 0.2, M15: 0.1, M5: 0.05 };
  let trendNet = 0;
  for (const [k, w] of Object.entries(tfWeights)) {
    const bias = tf[k]?.emaBias;
    if (bias === "bullish") trendNet += w;
    else if (bias === "bearish") trendNet -= w;
  }
  const trendLong = WEIGHTS.trend * Math.max(0, (trendNet + 1) / 2);
  breakdown.trend = { long: trendLong, short: WEIGHTS.trend - trendLong, max: WEIGHTS.trend };
  long += trendLong; short += WEIGHTS.trend - trendLong;
  if (trendNet > 0.4) reasonsFor.push(`Higher-timeframe EMA trend is bullish (D1: ${tf.D1.emaBias}, H4: ${tf.H4?.emaBias || "n/a"})`);
  if (trendNet < -0.4) reasonsFor.push(`Higher-timeframe EMA trend is bearish (D1: ${tf.D1.emaBias}, H4: ${tf.H4?.emaBias || "n/a"})`);

  // --- Structure ---
  const structScore = (bias) => bias === "bullish" ? 1 : bias === "lean_bullish" ? 0.6 : bias === "lean_bearish" ? 0.4 : bias === "bearish" ? 0 : 0.5;
  const sNet = (structScore(tf.D1.structure.bias) * 0.4 + structScore(tf.H4?.structure.bias ?? "neutral") * 0.35 + structScore(tf.H1.structure.bias) * 0.25);
  const structLong = WEIGHTS.structure * sNet;
  breakdown.structure = { long: structLong, short: WEIGHTS.structure - structLong, max: WEIGHTS.structure };
  long += structLong; short += WEIGHTS.structure - structLong;
  if (sNet > 0.65) reasonsFor.push(`Bullish swing structure: ${tf.H1.structure.detail} (H1)`);
  if (sNet < 0.35) reasonsFor.push(`Bearish swing structure: ${tf.H1.structure.detail} (H1)`);

  // --- Momentum ---
  let momNet = 0.5;
  if (rsiH1 != null) momNet += (rsiH1 - 50) / 100;
  if (macdHist != null && atrH1) momNet += Math.max(-0.2, Math.min(0.2, macdHist / atrH1 / 2));
  momNet = Math.max(0, Math.min(1, momNet));
  const momLong = WEIGHTS.momentum * momNet;
  breakdown.momentum = { long: momLong, short: WEIGHTS.momentum - momLong, max: WEIGHTS.momentum };
  long += momLong; short += WEIGHTS.momentum - momLong;
  if (rsiH1 != null && rsiH1 > 70) reasonsAgainst.push(`H1 RSI is stretched at ${rsiH1.toFixed(0)} — pullback risk`);
  if (rsiH1 != null && rsiH1 < 30) reasonsAgainst.push(`H1 RSI is oversold at ${rsiH1.toFixed(0)} — bounce risk`);

  // --- Support / resistance location ---
  const nearestSup = levels.supports[0], nearestRes = levels.resistances[0];
  let srNet = 0.5;
  if (atrH1 && nearestSup && nearestRes) {
    const dSup = (price - nearestSup.price) / atrH1;
    const dRes = (nearestRes.price - price) / atrH1;
    if (dRes < 0.6) { srNet -= 0.3; reasonsAgainst.push(`Price is within ${dRes.toFixed(1)} ATR of resistance at ${nearestRes.price.toFixed(0)} (${nearestRes.label})`); }
    if (dSup < 0.6) { srNet += 0.3; reasonsFor.push(`Price is holding just above support at ${nearestSup.price.toFixed(0)} (${nearestSup.label})`); }
    if (dRes > 2 && dSup > 1) srNet += 0.1;
  }
  srNet = Math.max(0, Math.min(1, srNet));
  const srLong = WEIGHTS.support_resistance * srNet;
  breakdown.support_resistance = { long: srLong, short: WEIGHTS.support_resistance - srLong, max: WEIGHTS.support_resistance };
  long += srLong; short += WEIGHTS.support_resistance - srLong;

  // --- Price action (BOS + M15 confirmation) ---
  let paNet = 0.5;
  if (tf.H1.structure.bos === "bullish_bos") { paNet += 0.25; reasonsFor.push("H1 break of structure to the upside"); }
  if (tf.H1.structure.bos === "bearish_bos") { paNet -= 0.25; reasonsFor.push("H1 break of structure to the downside"); }
  const m15Bias = tf.M15?.structure.bias;
  if (m15Bias === "bullish" || m15Bias === "lean_bullish") paNet += 0.15;
  if (m15Bias === "bearish" || m15Bias === "lean_bearish") paNet -= 0.15;
  paNet = Math.max(0, Math.min(1, paNet));
  const paLong = WEIGHTS.price_action * paNet;
  breakdown.price_action = { long: paLong, short: WEIGHTS.price_action - paLong, max: WEIGHTS.price_action };
  long += paLong; short += WEIGHTS.price_action - paLong;

  // --- Macro: DXY down + yields down = gold bullish ---
  const dxyTrend = trendOf(data.dxy), yieldTrend = trendOf(data.us10y);
  let macroNet = 0.5;
  const macroAvailable = dxyTrend != null || yieldTrend != null;
  if (dxyTrend) {
    if (dxyTrend.direction === "down") { macroNet += 0.25; reasonsFor.push(`DXY has weakened ${Math.abs(dxyTrend.pct).toFixed(1)}% over 10 sessions — supportive for gold`); }
    if (dxyTrend.direction === "up") { macroNet -= 0.25; reasonsAgainst.push(`DXY has strengthened ${dxyTrend.pct.toFixed(1)}% over 10 sessions — headwind for gold`); }
  }
  if (yieldTrend) {
    if (yieldTrend.direction === "down") { macroNet += 0.2; reasonsFor.push("US 10Y yield declining — supportive for gold"); }
    if (yieldTrend.direction === "up") { macroNet -= 0.2; reasonsAgainst.push("US 10Y yield rising — headwind for gold"); }
  }
  macroNet = Math.max(0, Math.min(1, macroNet));
  const macroLong = WEIGHTS.macro * macroNet;
  breakdown.macro = { long: macroLong, short: WEIGHTS.macro - macroLong, max: WEIGHTS.macro, available: macroAvailable };
  long += macroLong; short += WEIGHTS.macro - macroLong;

  long = Math.round(long); short = Math.round(short);

  // --- Conflict detection ---
  const dirs = Object.values(breakdown).map((b) => (b.long / b.max) - 0.5);
  const bulls = dirs.filter((d) => d > 0.12).length, bears = dirs.filter((d) => d < -0.12).length;
  const conflict = bulls > 0 && bears > 0 ? (Math.min(bulls, bears) >= 2 ? "HIGH" : "MODERATE") : "LOW";

  // --- Regime ---
  const regime = classifyRegime(tf, atrH1, price);

  // --- Decision ---
  const THRESHOLD = 70;
  let direction = "NO_TRADE";
  let confidence = Math.max(long, short);
  if (long >= THRESHOLD && long - short >= 15) direction = "LONG";
  else if (short >= THRESHOLD && short - long >= 15) direction = "SHORT";
  if (conflict === "HIGH" && direction !== "NO_TRADE") {
    confidence = Math.max(0, confidence - 10);
    if (confidence < THRESHOLD) { direction = "NO_TRADE"; reasonsAgainst.push("High evidence conflict reduced confidence below threshold"); }
  }

  // --- Trade setup (swing / position tier: score >= 70, R:R >= 2) ---
  let setup = null;
  if (direction !== "NO_TRADE" && atrH1) {
    setup = buildSetup(direction, price, atrH1, tf, levels);
    if (setup && setup.rr < 2) {
      reasonsAgainst.push(`Risk/reward ${setup.rr.toFixed(1)}:1 is below the 2:1 minimum`);
      direction = "NO_TRADE";
      setup = null;
    }
  }

  // --- Scalp / quick-trade tier (score >= 58, R:R >= 1, M15-based) ---
  const SCALP_THRESHOLD = 58, SCALP_GAP = 8;
  let scalp = null;
  const atrM15 = tf.M15 ? last(tf.M15.ind.atr14) : null;
  const scalpAtr = atrM15 || (atrH1 ? atrH1 * 0.5 : null);
  if (scalpAtr) {
    let sDir = "NO_TRADE";
    if (long >= SCALP_THRESHOLD && long - short >= SCALP_GAP) sDir = "LONG";
    else if (short >= SCALP_THRESHOLD && short - long >= SCALP_GAP) sDir = "SHORT";
    if (sDir !== "NO_TRADE" && conflict !== "HIGH") {
      const m15EmaBias = tf.M15?.emaBias, m5Bias = tf.M5?.emaBias;
      const aligned = sDir === "LONG"
        ? (m15EmaBias === "bullish" || m15EmaBias === "neutral") && (m5Bias !== "bearish")
        : (m15EmaBias === "bearish" || m15EmaBias === "neutral") && (m5Bias !== "bullish");
      if (aligned) {
        scalp = {
          direction: sDir,
          confidence: Math.max(long, short),
          setup: buildScalpSetup(sDir, price, scalpAtr, levels),
          m15Bias: m15EmaBias, m5Bias,
        };
      }
    }
  }

  const timeframeBias = {};
  for (const k of ["D1", "H4", "H1", "M15", "M5"]) {
    const b = tf[k]?.emaBias;
    timeframeBias[k] = b ? b.toUpperCase() : "N/A";
  }

  return {
    available: true,
    price,
    direction,
    confidence,
    longScore: long,
    shortScore: short,
    breakdown,
    conflict,
    regime,
    levels,
    setup,
    scalp,
    atrH1,
    rsiH1,
    timeframeBias,
    reasonsFor,
    reasonsAgainst,
    tf,
  };
}

function classifyRegime(tf, atrH1, price) {
  const d1 = tf.D1.emaBias, h4 = tf.H4?.emaBias, h1 = tf.H1.emaBias;
  const atrArr = tf.H1.ind.atr14.filter((v) => v != null);
  const atrAvg = atrArr.length > 20 ? atrArr.slice(-60).reduce((a, b) => a + b, 0) / Math.min(60, atrArr.length) : null;
  const volRatio = atrAvg ? atrH1 / atrAvg : 1;
  if (volRatio > 1.5) return "HIGH_VOLATILITY";
  if (d1 === "bullish" && h4 === "bullish" && h1 === "bullish") return "TRENDING_BULLISH";
  if (d1 === "bearish" && h4 === "bearish" && h1 === "bearish") return "TRENDING_BEARISH";
  if (d1 === "bullish" && (h1 === "bearish" || h1 === "neutral")) return "PULLBACK";
  if (d1 === "bearish" && (h1 === "bullish" || h1 === "neutral")) return "PULLBACK";
  if (volRatio < 0.65) return "LOW_VOLATILITY";
  if (h4 === "neutral" && h1 === "neutral") return "RANGE";
  return "UNCERTAIN";
}

function buildSetup(direction, price, atrH1, tf, levels) {
  const isLong = direction === "LONG";
  const swingLow = tf.H1.structure.lastSwingLow?.price;
  const swingHigh = tf.H1.structure.lastSwingHigh?.price;

  const entryLow = isLong ? price - atrH1 * 0.3 : price - atrH1 * 0.1;
  const entryHigh = isLong ? price + atrH1 * 0.1 : price + atrH1 * 0.3;
  const entryMid = (entryLow + entryHigh) / 2;

  // SL below/above structural invalidation
  let sl;
  if (isLong) {
    sl = swingLow != null && swingLow < price ? swingLow - atrH1 * 0.3 : price - atrH1 * 1.5;
    sl = Math.min(sl, entryLow - atrH1 * 0.8);
  } else {
    sl = swingHigh != null && swingHigh > price ? swingHigh + atrH1 * 0.3 : price + atrH1 * 1.5;
    sl = Math.max(sl, entryHigh + atrH1 * 0.8);
  }
  const risk = Math.abs(entryMid - sl);

  // TPs from structure levels — aim for MAXIMUM reward, not fixed R multiples.
  const cands = (isLong ? levels.resistances : levels.supports)
    .map((l) => l.price)
    .filter((p) => (isLong ? p > entryHigh + risk * 0.5 : p < entryLow - risk * 0.5))
    .sort((a, b) => Math.abs(a - entryMid) - Math.abs(b - entryMid));
  const fb = (m) => (isLong ? entryMid + risk * m : entryMid - risk * m);
  const tp1 = cands[0] ?? fb(2);
  const tp2 = cands[1] ?? fb(3.5);
  const farthest = cands.length > 0 ? cands[cands.length - 1] : fb(5);
  const tp3 = isLong ? Math.max(farthest, fb(5)) : Math.min(farthest, fb(5));
  const rr = Math.abs(tp3 - entryMid) / risk;   // MAX R:R (to farthest target)
  const rr1 = Math.abs(tp1 - entryMid) / risk;

  return {
    entryLow, entryHigh, sl, tp1, tp2, tp3, rr, rr1, risk,
    invalidation: isLong
      ? `LONG invalidated on H1 close below ${sl.toFixed(1)}`
      : `SHORT invalidated on H1 close above ${sl.toFixed(1)}`,
  };
}

// Tighter M15-based setup for intraday/scalp trades.
function buildScalpSetup(direction, price, atr, levels) {
  const isLong = direction === "LONG";
  const entryLow = price - atr * 0.15;
  const entryHigh = price + atr * 0.15;
  const entryMid = price;
  const sl = isLong ? price - atr * 0.8 : price + atr * 0.8;
  const risk = Math.abs(entryMid - sl);

  const cands = (isLong ? levels?.resistances : levels?.supports || [])
    .map((l) => l.price)
    .filter((p) => (isLong ? p > entryHigh + risk * 0.3 : p < entryLow - risk * 0.3))
    .sort((a, b) => Math.abs(a - entryMid) - Math.abs(b - entryMid));
  const fb = (m) => (isLong ? entryMid + risk * m : entryMid - risk * m);
  const tp1 = cands[0] ?? fb(1.2);
  const tp2 = cands[1] ?? fb(2.2);
  const farthest = cands.length > 0 ? cands[cands.length - 1] : fb(3.5);
  const tp3 = isLong ? Math.max(farthest, fb(3.5)) : Math.min(farthest, fb(3.5));
  const rr = Math.abs(tp3 - entryMid) / risk;   // MAX R:R (to farthest target)
  return {
    entryLow, entryHigh, sl, tp1, tp2, tp3, rr, risk,
    invalidation: isLong
      ? `Scalp LONG invalidated on M15 close below ${sl.toFixed(1)}`
      : `Scalp SHORT invalidated on M15 close above ${sl.toFixed(1)}`,
  };
}