// Market structure engine: swing detection, trend classification, support/resistance.
// Server-side mirror of src/lib/structure.js — keep in sync.

export function findSwings(candles, lookback = 3) {
  const swings = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const window = candles.slice(i - lookback, i + lookback + 1);
    const c = candles[i];
    if (window.every((w) => c.high >= w.high)) swings.push({ type: "high", index: i, price: c.high, time: c.time });
    if (window.every((w) => c.low <= w.low)) swings.push({ type: "low", index: i, price: c.low, time: c.time });
  }
  return swings;
}

// Classify structure from the most recent swings: HH/HL => bullish, LH/LL => bearish.
export function classifyStructure(candles) {
  const swings = findSwings(candles);
  const highs = swings.filter((s) => s.type === "high").slice(-3);
  const lows = swings.filter((s) => s.type === "low").slice(-3);
  if (highs.length < 2 || lows.length < 2) return { bias: "neutral", swings, detail: "Insufficient swing data" };

  const hh = highs[highs.length - 1].price > highs[highs.length - 2].price;
  const hl = lows[lows.length - 1].price > lows[lows.length - 2].price;
  const lh = highs[highs.length - 1].price < highs[highs.length - 2].price;
  const ll = lows[lows.length - 1].price < lows[lows.length - 2].price;

  let bias = "neutral", detail = "Mixed swing structure";
  if (hh && hl) { bias = "bullish"; detail = "Higher highs and higher lows"; }
  else if (lh && ll) { bias = "bearish"; detail = "Lower highs and lower lows"; }
  else if (hh || hl) { bias = "lean_bullish"; detail = hh ? "Higher high, lows mixed" : "Higher low, highs mixed"; }
  else if (lh || ll) { bias = "lean_bearish"; detail = lh ? "Lower high, lows mixed" : "Lower low, highs mixed"; }

  // Break of structure: close beyond last swing extreme
  const lastClose = candles[candles.length - 1].close;
  const lastHigh = highs[highs.length - 1], lastLow = lows[lows.length - 1];
  let bos = null;
  if (lastClose > lastHigh.price) bos = "bullish_bos";
  if (lastClose < lastLow.price) bos = "bearish_bos";

  return { bias, detail, bos, swings, lastSwingHigh: lastHigh, lastSwingLow: lastLow };
}

// Trend bias from EMA alignment + price location.
export function emaTrendBias(candles, ind) {
  const close = candles[candles.length - 1]?.close;
  const e20 = lastVal(ind.ema20), e50 = lastVal(ind.ema50), e200 = lastVal(ind.ema200);
  if (close == null || e50 == null) return "neutral";
  let score = 0;
  if (e20 != null) score += close > e20 ? 1 : -1;
  score += close > e50 ? 1 : -1;
  if (e200 != null) score += close > e200 ? 1.5 : -1.5;
  if (e20 != null && e50 != null) score += e20 > e50 ? 1 : -1;
  if (score >= 2.5) return "bullish";
  if (score <= -2.5) return "bearish";
  return "neutral";
}

function lastVal(arr) {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i];
  return null;
}

// Support/resistance from swing clusters, prior day/week extremes and round numbers.
export function findLevels(daily, h1, currentPrice) {
  const levels = [];
  const add = (price, label, weight) => levels.push({ price, label, weight });

  const swings = [...findSwings(h1, 4), ...findSwings(daily, 2)];
  // Cluster swings within 0.15% of each other
  const tol = currentPrice * 0.0015;
  const clusters = [];
  for (const s of swings.sort((a, b) => a.price - b.price)) {
    const c = clusters.find((cl) => Math.abs(cl.price - s.price) < tol);
    if (c) { c.count++; c.price = (c.price * (c.count - 1) + s.price) / c.count; }
    else clusters.push({ price: s.price, count: 1 });
  }
  clusters.filter((c) => c.count >= 2).forEach((c) => add(c.price, "Swing cluster", c.count));

  if (daily.length >= 2) {
    const prevDay = daily[daily.length - 2];
    add(prevDay.high, "Prev day high", 2);
    add(prevDay.low, "Prev day low", 2);
  }
  if (daily.length >= 6) {
    const week = daily.slice(-6, -1);
    add(Math.max(...week.map((c) => c.high)), "Prev week high", 2.5);
    add(Math.min(...week.map((c) => c.low)), "Prev week low", 2.5);
  }
  // Psychological round levels near price
  const step = 50;
  const base = Math.floor(currentPrice / step) * step;
  for (let i = -2; i <= 2; i++) add(base + i * step, "Round level", 1.5);

  // Dedupe close levels, keep highest weight
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