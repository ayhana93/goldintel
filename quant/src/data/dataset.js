// Assembles the research datasets from normalized CSVs.
//
// Two feeds are kept separate on purpose (see quant/src/periods.js). Loading is
// per-feed; nothing is spliced, so a result can always be attributed to one
// publisher's bars.
//
// The macro leg is a documented compromise. The production engine reads DXY and
// the US 10-year yield from a live vendor; neither is in either historical
// archive, so the dollar leg is reconstructed from the majors that ARE present
// and the yield leg is absent entirely. The cost of that reconstruction is
// measured rather than assumed — see quant/scripts/check-feeds.mjs.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeSeries, aggregate } from '../core/candles.js';

function readNormalized(dir, feed, symbol, timeframe) {
  const path = join(dir, `${feed}_${symbol}_${timeframe}.csv`);
  if (!existsSync(path)) {
    throw new Error(
      `Missing normalized data: ${path}\n` +
      `The vendor CSV is not committed. Rebuild it with:\n` +
      `  npm run quant:data\n` +
      `Checksums of the exact files every published result used are in quant/data/MANIFEST.json.`
    );
  }
  const lines = readFileSync(path, 'utf8').split('\n');
  const candles = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const [ts, o, h, l, c, v] = lines[i].split(',');
    candles.push({ openTime: Date.parse(ts), open: +o, high: +h, low: +l, close: +c, volume: +v || 0 });
  }
  return candles;
}

export function loadSeries(dir, feed, symbol, timeframe) {
  return makeSeries({
    symbol, timeframe, source: feed,
    candles: readNormalized(dir, feed, symbol, timeframe),
    now: Number.POSITIVE_INFINITY,   // completed historical file: every bar is closed
    timezone: 'UTC',
  });
}

/**
 * Trade-weighted dollar index proxy.
 *
 * The published DXY is
 *   50.14348112 · EURUSD^-0.576 · USDJPY^0.136 · GBPUSD^-0.119 · USDCAD^0.091
 *                · USDSEK^0.042 · USDCHF^0.036
 *
 * Neither archive carries USDSEK. The modern feed also has no USDJPY, so its
 * proxy is built from the four DXY members present and renormalized over their
 * combined weight. That omission is not waved through: check-feeds.mjs builds
 * BOTH the five-member and four-member proxies on the legacy feed (which does
 * have USDJPY) and reports how often they disagree on the 10-day direction the
 * strategy actually reads.
 */
const DXY_WEIGHTS = { EURUSD: -0.576, USDJPY: 0.136, GBPUSD: -0.119, USDCAD: 0.091, USDCHF: 0.036 };
const DXY_CONST = 50.14348112;

export function buildDollarProxy(dir, feed, legs = null) {
  const available = legs ?? Object.keys(DXY_WEIGHTS).filter((s) => existsSync(join(dir, `${feed}_${s}_H1.csv`)));
  if (available.length === 0) return null;

  // Renormalize the surviving exponents so the basket still carries unit weight.
  const totalWeight = available.reduce((a, s) => a + Math.abs(DXY_WEIGHTS[s]), 0);
  const scaled = available.map((s) => ({ symbol: s, exp: DXY_WEIGHTS[s] / totalWeight }));

  const maps = scaled.map(({ symbol, exp }) => {
    const m = new Map();
    for (const c of readNormalized(dir, feed, symbol, 'H1')) m.set(c.openTime, c);
    return { exp, m };
  });

  const times = [...maps[0].m.keys()].sort((a, b) => a - b);
  const candles = [];
  for (const t of times) {
    let open = 1, close = 1, high = 1, low = 1;
    let ok = true;
    for (const { exp, m } of maps) {
      const c = m.get(t);
      if (!c || !(c.open > 0) || !(c.close > 0)) { ok = false; break; }
      open *= Math.pow(c.open, exp);
      close *= Math.pow(c.close, exp);
      high *= Math.pow(exp > 0 ? c.high : c.low, exp);
      low *= Math.pow(exp > 0 ? c.low : c.high, exp);
    }
    if (!ok) continue;
    const hi = Math.max(open, close, high, low);
    const lo = Math.min(open, close, high, low);
    candles.push({ openTime: t, open, high: hi, low: lo, close, volume: 0 });
  }
  if (candles.length === 0) return null;

  // The level is arbitrary once exponents are renormalized; rescale so the first
  // bar sits at 100. Only the rate of change is ever read by the strategy.
  const k = 100 / candles[0].close;
  for (const c of candles) { c.open *= k; c.high *= k; c.low *= k; c.close *= k; }

  return makeSeries({
    symbol: 'DXY_PROXY', timeframe: 'H1',
    source: `synthetic:${feed}:${available.join('+')}`,
    candles, now: Number.POSITIVE_INFINITY, timezone: 'UTC',
  });
}

export function loadGoldDataset(dir, feed = 'modern') {
  const m15 = loadSeries(dir, feed, 'XAUUSD', 'M15');
  const h1 = loadSeries(dir, feed, 'XAUUSD', 'H1');
  const h4 = loadSeries(dir, feed, 'XAUUSD', 'H4');
  const d1 = loadSeries(dir, feed, 'XAUUSD', 'D1');
  const dxyH1 = buildDollarProxy(dir, feed);
  const dxy = dxyH1 ? aggregate(dxyH1, 'D1', { minCoverage: 0.3 }) : null;
  return { feed, m15, h1, h4, d1, dxy, dxyH1 };
}

export { DXY_WEIGHTS, DXY_CONST };
