// Fetches real market data from Yahoo Finance's public chart API.
// Never fabricates values — failed fetches are returned as { status: "unavailable" }.
// Shared by the marketData and generateSignals backend functions.

export async function fetchChart(symbol, interval, range) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return { status: 'unavailable', error: `HTTP ${res.status}` };
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return { status: 'unavailable', error: json?.chart?.error?.description || 'No data' };
  const ts = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    if (q.open?.[i] == null || q.close?.[i] == null) continue;
    candles.push({
      time: ts[i] * 1000,
      open: q.open[i],
      high: q.high[i],
      low: q.low[i],
      close: q.close[i],
      volume: q.volume?.[i] ?? 0,
    });
  }
  if (candles.length === 0) return { status: 'unavailable', error: 'Empty candle set' };
  return {
    status: 'ok',
    meta: {
      price: result.meta?.regularMarketPrice ?? candles[candles.length - 1].close,
      previousClose: result.meta?.chartPreviousClose ?? null,
      symbol: result.meta?.symbol,
      fetchedAt: Date.now(),
    },
    candles,
  };
}

export function aggregate4h(h1) {
  if (h1.status !== 'ok') return h1;
  const out = [];
  let bucket = null;
  for (const c of h1.candles) {
    const key = Math.floor(c.time / (4 * 3600 * 1000));
    if (!bucket || bucket.key !== key) {
      if (bucket) out.push(bucket.c);
      bucket = { key, c: { ...c } };
    } else {
      bucket.c.high = Math.max(bucket.c.high, c.high);
      bucket.c.low = Math.min(bucket.c.low, c.low);
      bucket.c.close = c.close;
      bucket.c.volume += c.volume;
    }
  }
  if (bucket) out.push(bucket.c);
  return { status: 'ok', meta: h1.meta, candles: out };
}

// Fetches the full dataset needed by the signal engine (gold multi-timeframe + macro).
export async function fetchAllMarketData() {
  // Gold spot (XAUUSD=X) with futures fallback (GC=F)
  let goldSymbol = 'XAUUSD=X';
  let probe = await fetchChart(goldSymbol, '1d', '5d');
  if (probe.status !== 'ok') {
    goldSymbol = 'GC=F';
    probe = await fetchChart(goldSymbol, '1d', '5d');
  }
  if (probe.status !== 'ok') {
    return { gold: { status: 'unavailable', error: probe.error } };
  }

  const [m5, m15, h1, d1, dxy, us10y] = await Promise.all([
    fetchChart(goldSymbol, '5m', '5d'),
    fetchChart(goldSymbol, '15m', '5d'),
    fetchChart(goldSymbol, '60m', '3mo'),
    fetchChart(goldSymbol, '1d', '2y'),
    fetchChart('DX-Y.NYB', '1d', '6mo'),
    fetchChart('^TNX', '1d', '6mo'),
  ]);

  return {
    gold: {
      status: 'ok',
      symbol: goldSymbol,
      price: probe.meta.price,
      previousClose: probe.meta.previousClose,
      fetchedAt: Date.now(),
      timeframes: { M5: m5, M15: m15, H1: h1, H4: aggregate4h(h1), D1: d1 },
    },
    dxy,
    us10y,
  };
}