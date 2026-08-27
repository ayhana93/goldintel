// Canonical indicator implementations.
//
// The maths is deliberately identical to the original GoldIntel engine so that
// the "baseline" strategy in the backtest is a faithful reproduction of what the
// app does today, not an improved version of it. Every series is causal:
// out[i] depends only on inputs 0..i.

export function ema(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(closes, period = 14) {
  if (closes.length < period + 1) return [];
  const out = new Array(closes.length).fill(null);
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const line = closes.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null
  );
  const valid = line.filter((v) => v != null);
  const sig = ema(valid, signalPeriod);
  const offset = line.length - valid.length;
  const signal = line.map((_, i) => (i - offset >= 0 ? sig[i - offset] ?? null : null));
  const histogram = line.map((v, i) => (v != null && signal[i] != null ? v - signal[i] : null));
  return { line, signal, histogram };
}

export function atr(candles, period = 14) {
  if (candles.length < period + 1) return [];
  const out = new Array(candles.length).fill(null);
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  let prev = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period] = prev;
  for (let i = period; i < trs.length; i++) {
    prev = (prev * (period - 1) + trs[i]) / period;
    out[i + 1] = prev;
  }
  return out;
}

/** Rolling mean of the non-null tail of a causal series, as of index i. */
export function rollingMeanAt(series, i, window) {
  let sum = 0, n = 0;
  for (let k = i; k >= 0 && n < window; k--) {
    if (series[k] != null) { sum += series[k]; n++; }
  }
  return n === 0 ? null : sum / n;
}

export function last(arr) {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i];
  return null;
}

/**
 * Precompute the standard indicator set for a whole series.
 * Params are explicit so Phase 28 can perturb them.
 */
export function computeIndicators(candles, p = {}) {
  const { emaFastP = 20, emaMidP = 50, emaSlowP = 200, rsiP = 14, atrP = 14,
          macdFast = 12, macdSlow = 26, macdSignal = 9 } = p;
  const closes = candles.map((c) => c.close);
  return {
    params: { emaFastP, emaMidP, emaSlowP, rsiP, atrP, macdFast, macdSlow, macdSignal },
    ema20: ema(closes, emaFastP),
    ema50: ema(closes, emaMidP),
    ema200: ema(closes, emaSlowP),
    rsi14: rsi(closes, rsiP),
    macd: macd(closes, macdFast, macdSlow, macdSignal),
    atr14: atr(candles, atrP),
  };
}
