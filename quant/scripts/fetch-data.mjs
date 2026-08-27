#!/usr/bin/env node
// Downloads the historical datasets used by the research stack and normalizes
// them to UTC. Re-running is idempotent; a manifest with SHA-256 checksums is
// written so any result can be traced back to the exact bytes behind it.
//
//   node quant/scripts/fetch-data.mjs [--force]
//
// TWO FEEDS, deliberately kept separate rather than spliced into one file:
//
//   legacy  ejtraderLabs/historical-data   2012-05 → 2022-03   MT4 broker export
//   modern  ts4blader/market_data          2020-01 → 2025-12   OANDA-sourced, Git LFS
//
// They overlap over 2020-01 → 2022-03, which is what makes the split auditable:
// quant/scripts/check-feeds.mjs measures how far apart they are, and the answer
// is "$0.20 and 0.98 return correlation outside the 2020 COVID window, $2.50 and
// 0.31 inside it". See docs/DATA_SOURCES.md.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, PRICE_SCALE } from '../src/data/csvProvider.js';
import { toIso, eetStampToUtcMs } from '../src/core/time.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'normalized');
const force = process.argv.includes('--force');

/**
 * Both publishers stamp bars in MT4-style broker server time. Neither documents
 * it. The offset was established empirically for each feed independently, by
 * locating the Non-Farm Payrolls volatility spike: it lands on file-local 15:30
 * in BOTH daylight-saving seasons, which is only consistent with UTC+2 winter /
 * UTC+3 summer. check-feeds.mjs re-derives this on every run.
 */
const FEEDS = {
  legacy: {
    id: 'ejtraderLabs/historical-data',
    base: 'https://raw.githubusercontent.com/ejtraderLabs/historical-data/main',
    // integer-scaled prices, "YYYY-MM-DD HH:MM:SS" in EET/EEST
    path: (sym, tf) => `${sym}/${sym}${tf.toLowerCase()}.csv`,
    columns: { time: 0, open: 1, high: 2, low: 3, close: 4, volume: 5 },
    scaled: true,
    symbols: { XAUUSD: ['M15', 'H1', 'H4', 'D1'], EURUSD: ['H1'], USDJPY: ['H1'], GBPUSD: ['H1'], USDCAD: ['H1'], USDCHF: ['H1'] },
  },
  modern: {
    id: 'ts4blader/market_data',
    // Git LFS: the media endpoint serves the real bytes, raw.githubusercontent
    // serves only the pointer stub.
    base: 'https://media.githubusercontent.com/media/ts4blader/market_data/main',
    path: (sym, tf) => `${sym}/${sym}_${tf}.csv`,
    columns: { time: 0, open: 1, high: 2, low: 3, close: 4, volume: 5 },
    scaled: false,
    symbols: { XAUUSD: ['M15', 'H1', 'H4', 'D1'], EURUSD: ['H1'], GBPUSD: ['H1'], USDCAD: ['H1'], USDCHF: ['H1'], AUDUSD: ['H1'] },
  },
};

mkdirSync(OUT, { recursive: true });

async function download(url, dest) {
  if (existsSync(dest) && !force) return readFileSync(dest, 'utf8');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  const text = await res.text();
  if (text.startsWith('version https://git-lfs')) {
    throw new Error(`${url} returned a Git LFS pointer, not data. Use the media.githubusercontent.com endpoint.`);
  }
  writeFileSync(dest, text);
  return text;
}

/** The modern feed is plain decimal prices with a "YYYY-MM-DD HH:MM:SS" stamp. */
function parsePlain(text, { symbol, timeframe }) {
  const lines = text.split('\n');
  const candles = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const p = lines[i].split(',');
    if (p.length < 5) continue;
    const stamp = p[0].length === 10 ? `${p[0]} 00:00:00` : p[0];
    const openTime = eetStampToUtcMs(stamp);
    const o = +p[1], h = +p[2], l = +p[3], c = +p[4], v = +p[5] || 0;
    if (!Number.isFinite(openTime) || !Number.isFinite(o) || !Number.isFinite(c)) continue;
    candles.push({ openTime, open: o, high: h, low: l, close: c, volume: v });
  }
  candles.sort((a, b) => a.openTime - b.openTime);
  const out = [];
  for (const c of candles) {
    if (out.length && out[out.length - 1].openTime === c.openTime) continue;
    out.push(c);
  }
  return { symbol, timeframe, candles: out };
}

const manifest = { generatedAt: new Date().toISOString(), feeds: {} };

for (const [feedName, feed] of Object.entries(FEEDS)) {
  const raw = join(ROOT, 'data', 'cache', feedName);
  mkdirSync(raw, { recursive: true });
  manifest.feeds[feedName] = { id: feed.id, base: feed.base, sourceTimezone: 'EET/EEST (UTC+2 / UTC+3)', normalizedTimezone: 'UTC', files: [] };

  for (const [symbol, tfs] of Object.entries(feed.symbols)) {
    for (const tf of tfs) {
      const url = `${feed.base}/${feed.path(symbol, tf)}`;
      const rawPath = join(raw, `${symbol}_${tf}.csv`);
      process.stdout.write(`${feedName.padEnd(7)} ${symbol} ${tf.padEnd(4)} ... `);
      const text = await download(url, rawPath);
      const sha = createHash('sha256').update(text).digest('hex');

      const parsed = feed.scaled
        ? parseCsv(text, { symbol, timeframe: tf, scale: PRICE_SCALE[symbol] ?? 1 })
        : parsePlain(text, { symbol, timeframe: tf });

      const rows = ['openTimeUtc,open,high,low,close,volume'];
      for (const c of parsed.candles) rows.push([toIso(c.openTime), c.open, c.high, c.low, c.close, c.volume].join(','));
      writeFileSync(join(OUT, `${feedName}_${symbol}_${tf}.csv`), rows.join('\n'));

      const first = parsed.candles[0], lastC = parsed.candles.at(-1);
      manifest.feeds[feedName].files.push({
        symbol, timeframe: tf, url, sha256: sha, bars: parsed.candles.length,
        firstUtc: toIso(first.openTime), lastUtc: toIso(lastC.openTime),
        priceScaleDivisor: feed.scaled ? (PRICE_SCALE[symbol] ?? 1) : 1,
      });
      console.log(`${String(parsed.candles.length).padStart(7)} bars  ${toIso(first.openTime).slice(0, 10)} → ${toIso(lastC.openTime).slice(0, 10)}`);
    }
  }
}

writeFileSync(join(ROOT, 'data', 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
console.log('\nManifest: quant/data/MANIFEST.json');
