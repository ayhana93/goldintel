// Phase 3 — look-ahead-safe market structure.
//
// A fractal swing needs `lookback` candles on BOTH sides, so a swing at index i
// is not knowable until index i + lookback. The original code got away with this
// by bounding its loop, but it never recorded when a swing became known, so
// nothing downstream could be gated on it. Here every swing carries
// confirmedIndex / confirmedAt, and every consumer takes an `asOfIndex` and may
// only see swings whose confirmedIndex <= asOfIndex.

/**
 * All fractal swings in a series, each tagged with the bar that confirmed it.
 * Ordered by confirmedIndex so consumers can advance a single pointer.
 */
export function buildSwingTimeline(candles, lookback = 3) {
  const swings = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let isHigh = true, isLow = true;
    for (let k = i - lookback; k <= i + lookback; k++) {
      if (candles[k].high > c.high) isHigh = false;
      if (candles[k].low < c.low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    const confirmedIndex = i + lookback;
    const confirmedAt = candles[confirmedIndex].closeTime;
    if (isHigh) swings.push({ type: 'high', index: i, price: c.high, time: c.openTime, confirmedIndex, confirmedAt });
    if (isLow) swings.push({ type: 'low', index: i, price: c.low, time: c.openTime, confirmedIndex, confirmedAt });
  }
  swings.sort((a, b) => a.confirmedIndex - b.confirmedIndex || a.index - b.index);
  return swings;
}

/**
 * A cursor over a swing timeline that can only move forward. Calling
 * `knownAt(i)` returns the swings confirmed at or before bar i — by
 * construction it is impossible to obtain a swing from the future.
 */
export function makeSwingCursor(timeline) {
  let ptr = 0;
  const known = [];
  return {
    knownAt(i) {
      while (ptr < timeline.length && timeline[ptr].confirmedIndex <= i) known.push(timeline[ptr++]);
      return known;
    },
    reset() { ptr = 0; known.length = 0; },
  };
}

const BIAS_SCORE = { bullish: 1, lean_bullish: 0.6, neutral: 0.5, lean_bearish: 0.4, bearish: 0 };
export function biasScore(bias) {
  return BIAS_SCORE[bias] ?? 0.5;
}

/**
 * Swing-structure classification as of bar `i`, using only confirmed swings.
 * Mirrors the original classifyStructure semantics (HH/HL vs LH/LL over the last
 * three swings of each type) plus an explicit BOS flag.
 */
export function classifyStructureAt(candles, i, knownSwings) {
  const highs = [], lows = [];
  for (let k = knownSwings.length - 1; k >= 0 && (highs.length < 3 || lows.length < 3); k--) {
    const s = knownSwings[k];
    if (s.type === 'high' && highs.length < 3) highs.unshift(s);
    else if (s.type === 'low' && lows.length < 3) lows.unshift(s);
  }
  if (highs.length < 2 || lows.length < 2) {
    return { bias: 'neutral', detail: 'Insufficient swing data', bos: null, lastSwingHigh: highs.at(-1) ?? null, lastSwingLow: lows.at(-1) ?? null };
  }
  const hh = highs.at(-1).price > highs.at(-2).price;
  const hl = lows.at(-1).price > lows.at(-2).price;
  const lh = highs.at(-1).price < highs.at(-2).price;
  const ll = lows.at(-1).price < lows.at(-2).price;

  let bias = 'neutral', detail = 'Mixed swing structure';
  if (hh && hl) { bias = 'bullish'; detail = 'Higher highs and higher lows'; }
  else if (lh && ll) { bias = 'bearish'; detail = 'Lower highs and lower lows'; }
  else if (hh || hl) { bias = 'lean_bullish'; detail = hh ? 'Higher high, lows mixed' : 'Higher low, highs mixed'; }
  else if (lh || ll) { bias = 'lean_bearish'; detail = lh ? 'Lower high, lows mixed' : 'Lower low, highs mixed'; }

  const close = candles[i].close;
  const lastHigh = highs.at(-1), lastLow = lows.at(-1);
  let bos = null;
  if (close > lastHigh.price) bos = 'bullish_bos';
  if (close < lastLow.price) bos = 'bearish_bos';

  return { bias, detail, bos, lastSwingHigh: lastHigh, lastSwingLow: lastLow };
}

/** EMA alignment bias. Identical vote weights to the original engine. */
export function emaTrendBiasAt(candles, ind, i) {
  const close = candles[i]?.close;
  const e20 = ind.ema20[i], e50 = ind.ema50[i], e200 = ind.ema200[i];
  if (close == null || e50 == null) return 'neutral';
  let score = 0;
  if (e20 != null) score += close > e20 ? 1 : -1;
  score += close > e50 ? 1 : -1;
  if (e200 != null) score += close > e200 ? 1.5 : -1.5;
  if (e20 != null && e50 != null) score += e20 > e50 ? 1 : -1;
  if (score >= 2.5) return 'bullish';
  if (score <= -2.5) return 'bearish';
  return 'neutral';
}

/**
 * Support / resistance as of a point in time.
 *
 * Differences from the original findLevels, all of them audit fixes:
 *  - only confirmed swings are eligible (S3-1)
 *  - "previous week" is the previous ISO calendar week, not the last five bars (S3-2)
 *  - round-number spacing scales with price instead of a fixed $50 step (S3-3)
 *  - the swing pool is bounded to the most recent `maxSwings` of each series so
 *    cost stays linear across a decade of bars
 */
export function findLevelsAt({ h1Candles, h1Swings, d1Candles, d1Swings, d1Index, price, maxSwings = 60 }) {
  const levels = [];
  const add = (p, label, weight) => { if (Number.isFinite(p)) levels.push({ price: p, label, weight }); };

  const pool = [
    ...h1Swings.slice(-maxSwings),
    ...d1Swings.slice(-Math.round(maxSwings / 2)),
  ].sort((a, b) => a.price - b.price);

  const tol = price * 0.0015;
  const clusters = [];
  for (const s of pool) {
    const c = clusters.find((cl) => Math.abs(cl.price - s.price) < tol);
    if (c) { c.count++; c.price = (c.price * (c.count - 1) + s.price) / c.count; }
    else clusters.push({ price: s.price, count: 1 });
  }
  for (const c of clusters) if (c.count >= 2) add(c.price, 'Swing cluster', c.count);

  // Previous completed daily bar (d1Index is the newest CLOSED daily bar).
  if (d1Index >= 1) {
    add(d1Candles[d1Index].high, 'Prev day high', 2);
    add(d1Candles[d1Index].low, 'Prev day low', 2);
  }
  // Previous ISO week: walk back from the newest closed daily bar collecting the
  // week before the one that bar belongs to.
  if (d1Index >= 1) {
    const weekOf = (ms) => {
      const d = new Date(ms);
      const day = (d.getUTCDay() + 6) % 7;
      return Math.floor((d.getTime() - day * 86400000) / 86400000);
    };
    const currentWeek = weekOf(d1Candles[d1Index].openTime);
    let hi = -Infinity, lo = Infinity, found = false;
    for (let k = d1Index; k >= 0 && d1Index - k < 20; k--) {
      const w = weekOf(d1Candles[k].openTime);
      if (w === currentWeek) continue;
      if (!found) { found = true; }
      else if (w !== weekOf(d1Candles[k + 1].openTime)) break;
      hi = Math.max(hi, d1Candles[k].high);
      lo = Math.min(lo, d1Candles[k].low);
    }
    if (found) { add(hi, 'Prev week high', 2.5); add(lo, 'Prev week low', 2.5); }
  }

  // Price-scaled psychological levels: ~2.5% of price rounded to a clean step.
  const raw = price * 0.025;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * mag).reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
  const base = Math.floor(price / step) * step;
  for (let k = -2; k <= 2; k++) add(base + k * step, 'Round level', 1.5);

  const merged = [];
  for (const l of levels.sort((a, b) => a.price - b.price)) {
    const m = merged.find((x) => Math.abs(x.price - l.price) < tol);
    if (m) m.weight = Math.max(m.weight, l.weight) + 0.5;
    else merged.push({ ...l });
  }
  const supports = merged.filter((l) => l.price < price).sort((a, b) => b.price - a.price);
  const resistances = merged.filter((l) => l.price >= price).sort((a, b) => a.price - b.price);
  return { supports, resistances, all: merged };
}
