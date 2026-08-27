// Assembles the research dataset from normalized CSVs.
//
// The macro leg is a documented compromise. The production engine reads DXY and
// the US 10-year yield from Yahoo; neither is available in the historical archive
// this study can reach, so the dollar leg is reconstructed as a synthetic index
// from the five major pairs that ARE available, and the yield leg is absent.
// Both facts are recorded in docs/DATA_SOURCES.md and the macro component is
// additionally ablated in the comparison study so its contribution is measurable
// rather than assumed.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeSeries, aggregate } from '../core/candles.js';

function readNormalized(dir, symbol, timeframe) {
  const path = join(dir, `${symbol}_${timeframe}.csv`);
  if (!existsSync(path)) {
    throw new Error(
      `Missing normalized data: ${path}\n` +
      `The dataset is not committed (36 MB of vendor CSV). Rebuild it with:\n` +
      `  npm run quant:data\n` +
      `Checksums of the exact files every published result used are in quant/data/MANIFEST.json.`
    );
  }
  const lines = readFileSync(path, 'utf8').split('\n');
  const candles = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const [ts, o, h, l, c, v] = lines[i].split(',');
    candles.push({
      openTime: Date.parse(ts), open: +o, high: +h, low: +l, close: +c, volume: +v || 0,
    });
  }
  return candles;
}

export function loadSeries(dir, symbol, timeframe, source = 'csv-local') {
  return makeSeries({
    symbol, timeframe, source,
    candles: readNormalized(dir, symbol, timeframe),
    now: Number.POSITIVE_INFINITY,   // completed historical file: every bar is closed
    timezone: 'UTC',
  });
}

/**
 * Trade-weighted dollar index proxy.
 *
 * The real DXY is
 *   50.14348112 · EURUSD^-0.576 · USDJPY^0.136 · GBPUSD^-0.119 · USDCAD^0.091
 *                · USDSEK^0.042 · USDCHF^0.036
 * USDSEK is not in the archive, so its 4.2% weight is redistributed by
 * renormalizing the remaining exponents over 0.958. The level therefore differs
 * slightly from the published index; the strategy only ever reads its rate of
 * change, which is what this proxy preserves.
 */
const DXY_LEGS = [
  { symbol: 'EURUSD', exp: -0.576 },
  { symbol: 'USDJPY', exp: 0.136 },
  { symbol: 'GBPUSD', exp: -0.119 },
  { symbol: 'USDCAD', exp: 0.091 },
  { symbol: 'USDCHF', exp: 0.036 },
];
// Dropping USDSEK shifts the basket's level by a constant factor. Measured
// against the published DXY at eight points spread across 2013-2022 the ratio is
// 0.934 +/- 0.008, i.e. stable, so a single calibration constant restores the
// familiar scale without touching the rate of change the strategy actually reads.
const DXY_CONST = 50.14348112 / 0.934;

export function buildDollarProxy(dir) {
  const legs = DXY_LEGS.map((leg) => ({ ...leg, candles: readNormalized(dir, leg.symbol, 'H1') }));
  // USDSEK carries 4.2% of the basket and is absent, so scale every remaining
  // exponent by 1/0.958 to restore unit weight.
  const scaled = legs.map((l) => ({ ...l, exp: l.exp / 0.958 }));

  const maps = scaled.map((l) => {
    const m = new Map();
    for (const c of l.candles) m.set(c.openTime, c);
    return { exp: l.exp, m };
  });

  const times = [...maps[0].m.keys()].sort((a, b) => a - b);
  const candles = [];
  for (const t of times) {
    let open = DXY_CONST, high = DXY_CONST, low = DXY_CONST, close = DXY_CONST;
    let ok = true;
    for (const { exp, m } of maps) {
      const c = m.get(t);
      if (!c || !(c.open > 0) || !(c.close > 0)) { ok = false; break; }
      open *= Math.pow(c.open, exp);
      close *= Math.pow(c.close, exp);
      // A basket's extreme is not the product of the legs' extremes; use the
      // open/close envelope, widened by each leg's own range, as a bound.
      high *= Math.pow(exp > 0 ? c.high : c.low, exp);
      low *= Math.pow(exp > 0 ? c.low : c.high, exp);
    }
    if (!ok) continue;
    const hi = Math.max(open, close, high, low);
    const lo = Math.min(open, close, high, low);
    candles.push({ openTime: t, open, high: hi, low: lo, close, volume: 0 });
  }
  return makeSeries({
    symbol: 'DXY_PROXY', timeframe: 'H1', source: 'synthetic:fx-basket',
    candles, now: Number.POSITIVE_INFINITY, timezone: 'UTC',
  });
}

export function loadGoldDataset(dir) {
  const m15 = loadSeries(dir, 'XAUUSD', 'M15');
  const h1 = loadSeries(dir, 'XAUUSD', 'H1');
  const h4 = loadSeries(dir, 'XAUUSD', 'H4');
  const d1 = loadSeries(dir, 'XAUUSD', 'D1');
  const dxyH1 = buildDollarProxy(dir);
  const dxy = aggregate(dxyH1, 'D1', { minCoverage: 0.3 });
  return { m15, h1, h4, d1, dxy, dxyH1 };
}
