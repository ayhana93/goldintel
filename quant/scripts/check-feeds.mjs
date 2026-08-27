#!/usr/bin/env node
// Data provenance checks. Everything here is a measurement, not an assumption,
// and it re-runs on demand so the numbers in docs/DATA_SOURCES.md can be audited.
//
//   node quant/scripts/check-feeds.mjs
//
// 1. Derives each feed's timezone from the price data itself.
// 2. Measures how far the two independent feeds disagree over their overlap.
// 3. Measures what dropping USDJPY costs the dollar-index proxy.

import { join } from 'node:path';
import { loadSeries, buildDollarProxy } from '../src/data/dataset.js';
import { FEED_OVERLAP, COVID_DISLOCATION } from '../src/periods.js';
import { writeResult, ROOT } from '../src/report/io.js';

const DIR = join(ROOT, 'data', 'normalized');
const HOUR = 3_600_000;
const step = (m) => process.stdout.write(`\n=== ${m}\n`);

const corr = (a, b) => {
  const m = (x) => x.reduce((p, q) => p + q, 0) / x.length;
  const ma = m(a), mb = m(b);
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; n += x * y; da += x * x; db += y * y; }
  return da > 0 && db > 0 ? n / Math.sqrt(da * db) : null;
};
const r = (x, d = 4) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

// ------------------------------------------------------------------ 1. timezone
step('Timezone, derived from the data rather than assumed');
// Non-Farm Payrolls is released at 08:30 US Eastern: 13:30 UTC in winter, 12:30
// UTC in summer. If a feed is stamped in UTC the largest first-Friday bar moves
// by an hour between seasons. If it is stamped in EET/EEST it does not.
const tzReport = {};
for (const feed of ['legacy', 'modern']) {
  const m15 = loadSeries(DIR, feed, 'XAUUSD', 'M15');
  const agg = new Map();
  for (const c of m15.candles) {
    const d = new Date(c.openTime);
    if (d.getUTCDay() !== 5 || d.getUTCDate() > 7) continue;
    // Bucket by the hh:mm the file itself would have shown (UTC + the offset we applied).
    const key = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    const isSummer = d.getUTCMonth() >= 3 && d.getUTCMonth() <= 9;
    const k = `${isSummer ? 'summer' : 'winter'}|${key}`;
    const a = agg.get(k) ?? [0, 0];
    a[0] += c.high - c.low; a[1]++;
    agg.set(k, a);
  }
  const top = (season) => [...agg.entries()]
    .filter(([k, v]) => k.startsWith(season) && v[1] >= 8)
    .map(([k, v]) => [k.split('|')[1], v[0] / v[1], v[1]])
    .sort((a, b) => b[1] - a[1])[0];
  const w = top('winter'), s = top('summer');
  tzReport[feed] = {
    winterPeakUtc: w?.[0], winterMeanRange: r(w?.[1], 2), winterSample: w?.[2],
    summerPeakUtc: s?.[0], summerMeanRange: r(s?.[1], 2), summerSample: s?.[2],
    // Correct handling puts BOTH peaks on the true release instant in UTC.
    consistent: w?.[0] === '13:30' && s?.[0] === '12:30',
  };
  console.log(`  ${feed.padEnd(7)} winter peak ${w?.[0]} (mean $${r(w?.[1], 2)}, n=${w?.[2]})   summer peak ${s?.[0]} (mean $${r(s?.[1], 2)}, n=${s?.[2]})   ${tzReport[feed].consistent ? 'OK — both land on the NFP release' : 'MISMATCH'}`);
}

// ------------------------------------------------------------------ 2. overlap
step('Do the two independent feeds agree where they overlap?');
const A = new Map(loadSeries(DIR, 'legacy', 'XAUUSD', 'H1').candles.map((c) => [c.openTime, c]));
const B = new Map(loadSeries(DIR, 'modern', 'XAUUSD', 'H1').candles.map((c) => [c.openTime, c]));

function compare(from, to, label) {
  const times = [...A.keys()].filter((t) => B.has(t) && t >= from && t < to).sort((x, y) => x - y);
  const ra = [], rb = [], diffs = [];
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] !== HOUR) continue;
    ra.push(A.get(times[i]).close - A.get(times[i - 1]).close);
    rb.push(B.get(times[i]).close - B.get(times[i - 1]).close);
    diffs.push(Math.abs(A.get(times[i]).close - B.get(times[i]).close));
  }
  diffs.sort((x, y) => x - y);
  const out = {
    label, bars: ra.length,
    returnCorrelation: r(corr(ra, rb)),
    meanAbsCloseDiff: r(diffs.reduce((a, b) => a + b, 0) / diffs.length, 3),
    medianAbsCloseDiff: r(diffs[Math.floor(diffs.length / 2)], 3),
    p99AbsCloseDiff: r(diffs[Math.floor(diffs.length * 0.99)], 3),
  };
  console.log(`  ${label.padEnd(32)} n=${String(out.bars).padStart(6)}  returnCorr=${out.returnCorrelation}  mean|Δclose|=$${out.meanAbsCloseDiff}  p99=$${out.p99AbsCloseDiff}`);
  return out;
}
const overlap = [
  compare(FEED_OVERLAP.from, FEED_OVERLAP.to, 'whole overlap'),
  compare(COVID_DISLOCATION.from, COVID_DISLOCATION.to, 'COVID dislocation 2020-03..10'),
  compare(COVID_DISLOCATION.to, FEED_OVERLAP.to, 'after the dislocation'),
];
console.log('\n  Reading: outside the 2020 crisis the feeds are effectively the same instrument.');
console.log('  Inside it they are not — during that window "the price of gold" was broker-dependent');
console.log('  by dollars, so any result driven by those months is a property of the feed, not the market.');

// ------------------------------------------------------------------ 3. dollar proxy
step('What does dropping USDJPY cost the dollar-index proxy?');
// The legacy feed has USDJPY; the modern one does not. Build both proxies on the
// legacy feed and compare the only quantity the strategy reads: the sign of the
// 10-day rate of change.
const five = buildDollarProxy(DIR, 'legacy', ['EURUSD', 'USDJPY', 'GBPUSD', 'USDCAD', 'USDCHF']);
const four = buildDollarProxy(DIR, 'legacy', ['EURUSD', 'GBPUSD', 'USDCAD', 'USDCHF']);
const LOOKBACK = 10 * 24;   // 10 trading days of H1 bars
const f5 = new Map(five.candles.map((c) => [c.openTime, c.close]));
const f4 = new Map(four.candles.map((c) => [c.openTime, c.close]));
const times = [...f5.keys()].filter((t) => f4.has(t)).sort((a, b) => a - b);
let agree = 0, total = 0, bothMoved = 0, bothMovedAgree = 0;
const pct5 = [], pct4 = [];
for (let i = LOOKBACK; i < times.length; i++) {
  const t = times[i], p = times[i - LOOKBACK];
  if (!f5.has(p) || !f4.has(p)) continue;
  const a = ((f5.get(t) - f5.get(p)) / f5.get(p)) * 100;
  const b = ((f4.get(t) - f4.get(p)) / f4.get(p)) * 100;
  pct5.push(a); pct4.push(b);
  total++;
  if (Math.sign(a) === Math.sign(b)) agree++;
  // The engine only acts when the move clears 0.3%.
  const dir = (x) => (x > 0.3 ? 1 : x < -0.3 ? -1 : 0);
  if (dir(a) !== 0 || dir(b) !== 0) { bothMoved++; if (dir(a) === dir(b)) bothMovedAgree++; }
}
const proxyReport = {
  samples: total,
  rawSignAgreement: r((agree / total) * 100, 2),
  actionableDirectionAgreement: r((bothMovedAgree / bothMoved) * 100, 2),
  correlationOfTenDayChange: r(corr(pct5, pct4)),
};
console.log(`  10-day change correlation, 5-member vs 4-member: ${proxyReport.correlationOfTenDayChange}`);
console.log(`  raw sign agreement:                              ${proxyReport.rawSignAgreement}%`);
console.log(`  agreement on the direction the engine acts on:   ${proxyReport.actionableDirectionAgreement}%`);
console.log(`\n  The modern feed's proxy omits USDJPY (13.6% of the published basket).`);
console.log(`  Measured on the legacy feed, that omission changes the direction the engine`);
console.log(`  would act on in ${r(100 - proxyReport.actionableDirectionAgreement, 2)}% of hours.`);

writeResult('feed-checks', { timezone: tzReport, overlap, dollarProxy: proxyReport },
  { note: 'Data provenance measurements. Re-run with node quant/scripts/check-feeds.mjs' });
console.log('\n-> quant/results/feed-checks.json');
