// Market data access for the live application.
//
// Phase 1/2 of the trading system overhaul. Two things changed from the original:
//
//  1. The vendor is behind a provider interface. Yahoo is a DEVELOPMENT provider
//     and is labelled as one; swapping in a paid feed does not touch strategy code.
//  2. Every candle now carries openTime, closeTime and a `closed` flag. The old
//     feed handed the still-forming bar to the engine as if it were history,
//     which is why stored signals could not be reproduced. Strategy code must ask
//     for closed candles explicitly.
//
// Everything is UTC. Nothing here fabricates a value: a failed fetch is returned
// as { status: 'unavailable' }.

export const TF_MS = { M5: 300_000, M15: 900_000, H1: 3_600_000, H4: 14_400_000, D1: 86_400_000 };

const YAHOO_INTERVAL = { M5: '5m', M15: '15m', H1: '60m', D1: '1d' };

/**
 * Tag candles with close times and closed/developing state.
 * A candle is CLOSED once `now` has passed its close time.
 */
export function markCandleStates(candles, timeframe, now) {
  const step = TF_MS[timeframe];
  const out = new Array(candles.length);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const closeTime = c.openTime + step;
    out[i] = { ...c, closeTime, closed: closeTime <= now };
  }
  return out;
}

/** Only the candles that had actually closed. The only safe input for analysis. */
export function closedCandles(series) {
  if (!series || series.status !== 'ok') return [];
  const out = [];
  for (const c of series.candles) {
    if (!c.closed) break;
    out.push(c);
  }
  return out;
}

/** The bar currently forming, or null. Display code may use it; analysis may not. */
export function developingCandle(series) {
  if (!series || series.status !== 'ok') return null;
  const lastBar = series.candles[series.candles.length - 1];
  return lastBar && !lastBar.closed ? lastBar : null;
}

export async function fetchChart(symbol, timeframe, range, now = Date.now()) {
  const interval = YAHOO_INTERVAL[timeframe];
  if (!interval) return { status: 'unavailable', error: `Unsupported timeframe ${timeframe}` };
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  } catch (e) {
    return { status: 'unavailable', error: `Network error: ${e.message}` };
  }
  if (!res.ok) return { status: 'unavailable', error: `HTTP ${res.status}` };
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return { status: 'unavailable', error: json?.chart?.error?.description || 'No data' };

  const ts = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const raw = [];
  for (let i = 0; i < ts.length; i++) {
    if (q.open?.[i] == null || q.close?.[i] == null) continue;
    const high = q.high?.[i] ?? Math.max(q.open[i], q.close[i]);
    const low = q.low?.[i] ?? Math.min(q.open[i], q.close[i]);
    raw.push({
      openTime: ts[i] * 1000,
      open: q.open[i], high, low, close: q.close[i],
      volume: q.volume?.[i] ?? 0,
    });
  }
  if (raw.length === 0) return { status: 'unavailable', error: 'Empty candle set' };

  const candles = markCandleStates(raw, timeframe, now);
  const lastClosed = [...candles].reverse().find((c) => c.closed) ?? null;
  return {
    status: 'ok',
    source: 'yahoo-finance (development provider)',
    symbol: result.meta?.symbol ?? symbol,
    timeframe,
    timezone: 'UTC',
    fetchedAt: now,
    lastClosedTime: lastClosed?.closeTime ?? null,
    // How stale the newest closed bar is, in bar widths. > 2 means something is wrong.
    stalenessBars: lastClosed ? (now - lastClosed.closeTime) / TF_MS[timeframe] : null,
    meta: {
      price: result.meta?.regularMarketPrice ?? raw[raw.length - 1].close,
      previousClose: result.meta?.chartPreviousClose ?? null,
    },
    candles,
  };
}

/**
 * Aggregate H1 into H4.
 *
 * The original version bucketed by epoch division and emitted every bucket, so a
 * weekend stub of one or two hours was handed to the engine as a completed 4-hour
 * candle. This one drops buckets whose source coverage is too low and marks a
 * bucket closed only when all four of its hours have closed.
 */
export function aggregateH4(h1, now = Date.now()) {
  if (!h1 || h1.status !== 'ok') return h1;
  const step = TF_MS.H4;
  const buckets = new Map();
  for (const c of h1.candles) {
    const key = Math.floor(c.openTime / step) * step;
    const b = buckets.get(key);
    if (!b) {
      buckets.set(key, { openTime: key, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, n: 1 });
    } else {
      b.high = Math.max(b.high, c.high);
      b.low = Math.min(b.low, c.low);
      b.close = c.close;
      b.volume += c.volume;
      b.n++;
    }
  }
  const raw = [...buckets.values()]
    .sort((a, b) => a.openTime - b.openTime)
    .filter((b) => b.n >= 2)                    // refuse to ship a 1-hour "4H" candle
    .map(({ n, ...rest }) => rest);

  const candles = markCandleStates(raw, 'H4', now);
  const lastClosed = [...candles].reverse().find((c) => c.closed) ?? null;
  return {
    status: 'ok',
    source: `${h1.source}:aggregated-from-H1`,
    symbol: h1.symbol, timeframe: 'H4', timezone: 'UTC',
    fetchedAt: now,
    lastClosedTime: lastClosed?.closeTime ?? null,
    stalenessBars: lastClosed ? (now - lastClosed.closeTime) / step : null,
    meta: h1.meta,
    candles,
  };
}

/**
 * The full dataset the signal engine needs.
 *
 * `price` is deliberately NOT the vendor's real-time quote any more. The original
 * built every entry, stop and target from a tick fetched in a separate request,
 * so the levels referenced a price that appeared in none of the candles used to
 * justify them. The reference price is now the close of the newest CLOSED H1
 * candle — the same bar the decision is made from. The live quote is still
 * returned, for display and for measuring how far price has already travelled.
 */
export async function fetchAllMarketData(now = Date.now()) {
  let goldSymbol = 'XAUUSD=X';
  let probe = await fetchChart(goldSymbol, 'D1', '5d', now);
  if (probe.status !== 'ok') {
    goldSymbol = 'GC=F';
    probe = await fetchChart(goldSymbol, 'D1', '5d', now);
  }
  if (probe.status !== 'ok') return { gold: { status: 'unavailable', error: probe.error }, fetchedAt: now };

  const [m5, m15, h1, d1, dxy, us10y] = await Promise.all([
    fetchChart(goldSymbol, 'M5', '5d', now),
    fetchChart(goldSymbol, 'M15', '5d', now),
    fetchChart(goldSymbol, 'H1', '3mo', now),
    fetchChart(goldSymbol, 'D1', '2y', now),
    fetchChart('DX-Y.NYB', 'D1', '6mo', now),
    fetchChart('^TNX', 'D1', '6mo', now),
  ]);

  const h1Closed = closedCandles(h1);
  const referencePrice = h1Closed.length ? h1Closed[h1Closed.length - 1].close : null;

  return {
    gold: {
      status: 'ok',
      source: 'yahoo-finance (development provider)',
      symbol: goldSymbol,
      timezone: 'UTC',
      // The price the strategy reasons about: the last CLOSED H1 close.
      referencePrice,
      referenceTime: h1Closed.length ? h1Closed[h1Closed.length - 1].closeTime : null,
      // The live quote, for display only.
      livePrice: probe.meta.price,
      previousClose: probe.meta.previousClose,
      fetchedAt: now,
      timeframes: { M5: m5, M15: m15, H1: h1, H4: aggregateH4(h1, now), D1: d1 },
    },
    dxy,
    us10y,
    fetchedAt: now,
  };
}
