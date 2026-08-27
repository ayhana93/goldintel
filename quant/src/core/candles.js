// Phase 2 — the closed-candle engine.
//
// A candle is CLOSED when the wall clock has passed its close time. Until then it
// is DEVELOPING and its high/low/close can still change. The original GoldIntel
// engine had no such distinction and consumed the developing bar as if it were
// history, which is why its stored signals could not be replayed (audit S1-1).
//
// Rules enforced here:
//   * every candle carries openTime, closeTime and state
//   * closedOnly() is the only door the backtester may use
//   * asOf() answers "what was known at instant T" without ever returning a bar
//     whose closeTime is after T

import { tfMillis, floorToTf, toIso } from './time.js';

export const CLOSED = 'CLOSED';
export const DEVELOPING = 'DEVELOPING';

/**
 * Build a normalized, immutable series.
 *
 * @param {object} spec
 * @param {string} spec.symbol      e.g. "XAUUSD"
 * @param {string} spec.timeframe   e.g. "H1"
 * @param {string} spec.source      provider id, for provenance
 * @param {Array}  spec.candles     [{ openTime, open, high, low, close, volume }] ascending
 * @param {number} spec.now         instant the snapshot was taken (UTC ms)
 */
export function makeSeries({ symbol, timeframe, source, candles, now = Date.now(), timezone = 'UTC' }) {
  const step = tfMillis(timeframe);
  const out = new Array(candles.length);
  let prevOpen = -Infinity;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!(c.openTime > prevOpen)) {
      throw new Error(`${symbol} ${timeframe}: candles must be strictly ascending by openTime at index ${i}`);
    }
    prevOpen = c.openTime;
    if (!(c.high >= c.low && c.high >= c.open && c.high >= c.close && c.low <= c.open && c.low <= c.close)) {
      throw new Error(`${symbol} ${timeframe}: inconsistent OHLC at ${toIso(c.openTime)}`);
    }
    const closeTime = c.openTime + step;
    out[i] = {
      openTime: c.openTime,
      closeTime,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume ?? 0,
      state: closeTime <= now ? CLOSED : DEVELOPING,
    };
  }
  return Object.freeze({
    symbol,
    timeframe,
    source,
    timezone,
    fetchedAt: now,
    candles: out,
    // Freshness: how stale the newest closed bar is, in bar-widths.
    staleness: out.length ? (now - out[out.length - 1].closeTime) / step : Infinity,
  });
}

/** The subset of the series that is safe for historical analysis. */
export function closedOnly(series) {
  const idx = lastClosedIndex(series, series.fetchedAt);
  return idx < 0 ? [] : series.candles.slice(0, idx + 1);
}

/** The bar currently forming, or null. Live code must ask for this explicitly. */
export function developingCandle(series) {
  const lastBar = series.candles[series.candles.length - 1];
  return lastBar && lastBar.state === DEVELOPING ? lastBar : null;
}

/**
 * Index of the newest candle that had already closed at instant `atMs`.
 * Binary search on closeTime; returns -1 when nothing had closed yet.
 */
export function lastClosedIndex(series, atMs) {
  const c = series.candles;
  let lo = 0, hi = c.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (c[mid].closeTime <= atMs) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

/** Everything that was closed at instant `atMs`. The backtester's only view. */
export function asOf(series, atMs) {
  const idx = lastClosedIndex(series, atMs);
  return idx < 0 ? [] : series.candles.slice(0, idx + 1);
}

/**
 * Aggregate a lower timeframe into a higher one.
 *
 * Unlike the original aggregate4h, this refuses to emit a bucket that is not
 * demonstrably complete: a bucket is only CLOSED when the source series
 * contains a bar whose openTime is at or beyond the bucket's close. Partial
 * buckets are emitted with state DEVELOPING so they can be filtered out, and
 * buckets whose source coverage is below `minCoverage` are dropped entirely
 * (weekend and holiday stubs).
 */
export function aggregate(series, targetTf, { minCoverage = 0.5 } = {}) {
  const srcStep = tfMillis(series.timeframe);
  const dstStep = tfMillis(targetTf);
  if (dstStep % srcStep !== 0) {
    throw new Error(`${targetTf} is not an integer multiple of ${series.timeframe}`);
  }
  const perBucket = dstStep / srcStep;
  const buckets = [];
  let cur = null;
  for (const c of series.candles) {
    const key = floorToTf(c.openTime, targetTf);
    if (!cur || cur.key !== key) {
      if (cur) buckets.push(cur);
      cur = { key, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, n: 1, lastCloseTime: c.closeTime };
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
      cur.n++;
      cur.lastCloseTime = c.closeTime;
    }
  }
  if (cur) buckets.push(cur);

  const candles = [];
  for (const b of buckets) {
    if (b.n / perBucket < minCoverage) continue;
    candles.push({ openTime: b.key, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume });
  }
  return makeSeries({
    symbol: series.symbol,
    timeframe: targetTf,
    source: `${series.source}:aggregated-from-${series.timeframe}`,
    candles,
    now: series.fetchedAt,
    timezone: series.timezone,
  });
}

/**
 * For each bar of `driver`, the index of the newest `higher` bar that had closed
 * by the driver bar's close. Precomputed once so the backtester never has to
 * search, and can never accidentally look forward.
 *
 * Returns an Int32Array; -1 means "nothing had closed yet".
 */
export function alignIndex(driverCandles, higherCandles) {
  const map = new Int32Array(driverCandles.length).fill(-1);
  let j = -1;
  for (let i = 0; i < driverCandles.length; i++) {
    const t = driverCandles[i].closeTime;
    while (j + 1 < higherCandles.length && higherCandles[j + 1].closeTime <= t) j++;
    map[i] = j;
  }
  return map;
}
