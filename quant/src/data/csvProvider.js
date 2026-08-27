// Historical provider backed by normalized CSV files on disk.
//
// Source files are MT4-style broker exports stamped in EET/EEST. The timezone was
// not documented by the publisher; it was established empirically by locating the
// Non-Farm Payrolls volatility spike, which lands on 13:30 UTC in winter and
// 12:30 UTC in summer only under a UTC+2 / UTC+3 reading. See docs/DATA_SOURCES.md.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { eetStampToUtcMs } from '../core/time.js';
import { makeSeries } from '../core/candles.js';
import { registerProvider } from './provider.js';

/** Divisor that converts the integer-scaled CSV price into a real price. */
export const PRICE_SCALE = {
  XAUUSD: 100, EURUSD: 100000, GBPUSD: 100000, USDCAD: 100000, USDCHF: 100000, USDJPY: 1000,
};

export function parseCsv(text, { symbol, timeframe, scale, timestampMode = 'eet' }) {
  const lines = text.split('\n');
  const candles = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 5) continue;
    const stamp = parts[0];
    const openTime = timestampMode === 'eet'
      ? eetStampToUtcMs(stamp.length === 10 ? `${stamp} 00:00:00` : stamp)
      : Date.parse(`${stamp.replace(' ', 'T')}Z`);
    const o = Number(parts[1]) / scale;
    const h = Number(parts[2]) / scale;
    const l = Number(parts[3]) / scale;
    const c = Number(parts[4]) / scale;
    const v = parts[5] != null ? Number(parts[5]) : 0;
    if (!Number.isFinite(openTime) || !Number.isFinite(o) || !Number.isFinite(c)) continue;
    candles.push({ openTime, open: o, high: h, low: l, close: c, volume: Number.isFinite(v) ? v : 0 });
  }
  candles.sort((a, b) => a.openTime - b.openTime);
  // Daily bars in these exports are stamped at 00:00 broker time, which after the
  // DST shift can collide across the changeover weekend. Keep the first of a pair.
  const deduped = [];
  for (const c of candles) {
    if (deduped.length && deduped[deduped.length - 1].openTime === c.openTime) continue;
    deduped.push(c);
  }
  return { symbol, timeframe, candles: deduped };
}

export function createCsvProvider({ dir, id = 'csv-local' }) {
  const cache = new Map();
  return registerProvider({
    id,
    kind: 'historical',
    dir,
    supports: (symbol) => existsSync(join(dir, `${symbol}_H1.csv`)) || existsSync(join(dir, `${symbol}_D1.csv`)) || existsSync(join(dir, `${symbol}_M15.csv`)),
    async getSeries({ symbol, timeframe, now = Number.POSITIVE_INFINITY }) {
      const key = `${symbol}|${timeframe}`;
      if (cache.has(key)) return cache.get(key);
      const path = join(dir, `${symbol}_${timeframe}.csv`);
      if (!existsSync(path)) throw new Error(`No local data for ${symbol} ${timeframe} (expected ${path})`);
      const scale = PRICE_SCALE[symbol] ?? 1;
      const parsed = parseCsv(readFileSync(path, 'utf8'), { symbol, timeframe, scale });
      // `now = Infinity` marks every bar CLOSED: these are completed historical
      // files, and the backtester still gates on closeTime <= decision instant.
      const series = makeSeries({ ...parsed, source: id, now, timezone: 'UTC' });
      cache.set(key, series);
      return series;
    },
  });
}
