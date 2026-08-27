// Market structure with explicit swing confirmation timing.
//
// A fractal swing needs `lookback` candles on BOTH sides, so a swing at index i
// is not knowable until index i + lookback. The original code never recorded
// when a swing became known, which made its history impossible to replay. Every
// swing now carries confirmedIndex / confirmedAt.
//
// Keep in sync with base44/shared/structure.ts — quant/test/mirror.test.js enforces it.

export function findSwings(candles, lookback = 3) {
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
    const confirmedAt = candles[confirmedIndex].closeTime ?? candles[confirmedIndex].openTime;
    const time = c.openTime ?? c.time;
    if (isHigh) swings.push({ type: 'high', index: i, price: c.high, time, confirmedIndex, confirmedAt });
    if (isLow) swings.push({ type: 'low', index: i, price: c.low, time, confirmedIndex, confirmedAt });
  }
  return swings;
}

const BIAS_SCORE = { bullish: 1, lean_bullish: 0.6, neutral: 0.5, lean_bearish: 0.4, bearish: 0 };
export function biasScore(bias) {
  return BIAS_SCORE[bias] ?? 0.5;
}

/** Swing structure classification from confirmed swings only. */
export function classifyStructure(candles, lookback = 3) {
  const swings = findSwings(candles, lookback);
  const highs = swings.filter((s) => s.type === 'high').slice(-3);
  const lows = swings.filter((s) => s.type === 'low').slice(-3);
  if (highs.length < 2 || lows.length < 2) {
    return { bias: 'neutral', detail: 'Insufficient swing data', bos: null, swings, lastSwingHigh: highs.at(-1) ?? null, lastSwingLow: lows.at(-1) ?? null };
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

  const lastClose = candles[candles.length - 1].close;
  const lastHigh = highs.at(-1), lastLow = lows.at(-1);
  let bos = null;
  if (lastClose > lastHigh.price) bos = 'bullish_bos';
  if (lastClose < lastLow.price) bos = 'bearish_bos';

  return { bias, detail, bos, swings, lastSwingHigh: lastHigh, lastSwingLow: lastLow };
}

/** Trend bias from EMA alignment and price location. */
export function emaTrendBias(candles, ind) {
  const close = candles[candles.length - 1]?.close;
  const e20 = lastVal(ind.ema20), e50 = lastVal(ind.ema50), e200 = lastVal(ind.ema200);
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

function lastVal(arr) {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i];
  return null;
}

/**
 * Support and resistance.
 *
 * Fixes carried over from the audit: the previous-week level is the previous ISO
 * calendar week rather than a rolling five-bar window, and round-number spacing
 * scales with price instead of being pinned at $50 — a step that meant something
 * different at $1,200 gold than it does at $4,000.
 */
export function findLevels(daily, h1, currentPrice) {
  const levels = [];
  const add = (price, label, weight) => { if (Number.isFinite(price)) levels.push({ price, label, weight }); };

  const swings = [...findSwings(h1, 4).slice(-60), ...findSwings(daily, 2).slice(-30)];
  const tol = currentPrice * 0.0015;
  const clusters = [];
  for (const s of swings.sort((a, b) => a.price - b.price)) {
    const c = clusters.find((cl) => Math.abs(cl.price - s.price) < tol);
    if (c) { c.count++; c.price = (c.price * (c.count - 1) + s.price) / c.count; }
    else clusters.push({ price: s.price, count: 1 });
  }
  clusters.filter((c) => c.count >= 2).forEach((c) => add(c.price, 'Swing cluster', c.count));

  if (daily.length >= 1) {
    const prevDay = daily[daily.length - 1];   // newest CLOSED daily bar
    add(prevDay.high, 'Prev day high', 2);
    add(prevDay.low, 'Prev day low', 2);
  }
  const week = previousIsoWeek(daily);
  if (week) { add(week.high, 'Prev week high', 2.5); add(week.low, 'Prev week low', 2.5); }

  const raw = currentPrice * 0.025;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * mag).reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
  const base = Math.floor(currentPrice / step) * step;
  for (let i = -2; i <= 2; i++) add(base + i * step, 'Round level', 1.5);

  const merged = [];
  for (const l of levels.sort((a, b) => a.price - b.price)) {
    const m = merged.find((x) => Math.abs(x.price - l.price) < tol);
    if (m) m.weight = Math.max(m.weight, l.weight) + 0.5;
    else merged.push({ ...l });
  }
  const supports = merged.filter((l) => l.price < currentPrice).sort((a, b) => b.price - a.price);
  const resistances = merged.filter((l) => l.price >= currentPrice).sort((a, b) => a.price - b.price);
  return { supports, resistances, all: merged };
}

function previousIsoWeek(daily) {
  if (daily.length < 2) return null;
  const weekOf = (ms) => {
    const d = new Date(ms);
    const day = (d.getUTCDay() + 6) % 7;
    return Math.floor((d.getTime() - day * 86400000) / 86400000);
  };
  const t = (c) => c.openTime ?? c.time;
  const currentWeek = weekOf(t(daily[daily.length - 1]));
  let targetWeek = null, high = -Infinity, low = Infinity, found = false;
  for (let i = daily.length - 1; i >= 0 && daily.length - i < 20; i--) {
    const w = weekOf(t(daily[i]));
    if (w === currentWeek) continue;
    if (targetWeek == null) targetWeek = w;
    if (w !== targetWeek) break;
    high = Math.max(high, daily[i].high);
    low = Math.min(low, daily[i].low);
    found = true;
  }
  return found ? { high, low } : null;
}
