#!/usr/bin/env node
// Downloads the historical dataset used by the research stack and normalizes it
// to UTC. Re-running is idempotent; a manifest with SHA-256 checksums is written
// so any result can be traced back to the exact bytes it was produced from.
//
//   node quant/scripts/fetch-data.mjs [--force]

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, PRICE_SCALE } from '../src/data/csvProvider.js';
import { toIso } from '../src/core/time.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'cache');
const OUT = join(ROOT, 'data', 'normalized');
const BASE = 'https://raw.githubusercontent.com/ejtraderLabs/historical-data/main';

const WANTED = [
  { symbol: 'XAUUSD', tfs: ['m15', 'h1', 'h4', 'd1'] },
  { symbol: 'EURUSD', tfs: ['h1'] },
  { symbol: 'USDJPY', tfs: ['h1'] },
  { symbol: 'GBPUSD', tfs: ['h1'] },
  { symbol: 'USDCAD', tfs: ['h1'] },
  { symbol: 'USDCHF', tfs: ['h1'] },
];

const TF_UP = { m15: 'M15', m30: 'M30', h1: 'H1', h4: 'H4', d1: 'D1' };
const force = process.argv.includes('--force');

mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });

async function download(url, dest) {
  if (existsSync(dest) && !force) return readFileSync(dest, 'utf8');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(dest, text);
  return text;
}

const manifest = { generatedAt: new Date().toISOString(), base: BASE, files: [] };

for (const { symbol, tfs } of WANTED) {
  for (const tf of tfs) {
    const url = `${BASE}/${symbol}/${symbol}${tf}.csv`;
    const rawPath = join(RAW, `${symbol}${tf}.csv`);
    process.stdout.write(`${symbol} ${tf} ... `);
    const text = await download(url, rawPath);
    const sha = createHash('sha256').update(text).digest('hex');

    const parsed = parseCsv(text, { symbol, timeframe: TF_UP[tf], scale: PRICE_SCALE[symbol] ?? 1 });
    const rows = ['openTimeUtc,open,high,low,close,volume'];
    for (const c of parsed.candles) {
      rows.push([toIso(c.openTime), c.open, c.high, c.low, c.close, c.volume].join(','));
    }
    const outPath = join(OUT, `${symbol}_${TF_UP[tf]}.csv`);
    writeFileSync(outPath, rows.join('\n'));

    const first = parsed.candles[0], lastC = parsed.candles.at(-1);
    manifest.files.push({
      symbol, timeframe: TF_UP[tf], url, sha256: sha, bars: parsed.candles.length,
      firstUtc: toIso(first.openTime), lastUtc: toIso(lastC.openTime),
      sourceTimezone: 'EET/EEST (UTC+2 / UTC+3)', normalizedTimezone: 'UTC',
      priceScaleDivisor: PRICE_SCALE[symbol] ?? 1,
    });
    console.log(`${parsed.candles.length} bars  ${toIso(first.openTime)} → ${toIso(lastC.openTime)}`);
  }
}

writeFileSync(join(ROOT, 'data', 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
console.log(`\nManifest: quant/data/MANIFEST.json`);
