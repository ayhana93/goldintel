#!/usr/bin/env node
// Reproduces the numbers that are currently committed in base44/shared/edgeStats.ts
// and docs/EDGE_REPORT.md, from scratch, on the same feed and the same periods
// they were originally produced from.
//
//   node quant/scripts/verify-published.mjs
//
// The point is not to confirm a hope. A statistic that exists in a repository is
// not evidence that the code which produced it was correct, and the split has
// since changed underneath it. If any figure fails to reproduce, that is a bug
// report about the pipeline, and it is printed as one.

import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { loadGoldDataset } from '../src/data/dataset.js';
import { buildContext } from '../src/core/context.js';
import { buildCalendar, makeNewsWindow } from '../src/core/calendar.js';
import { runBacktest } from '../src/backtest/engine.js';
import { computeMetrics, significance } from '../src/backtest/metrics.js';
import { productionSwing, productionScalp, setupStrategy } from '../src/backtest/strategies.js';
import { EDGE_STATS } from '../../base44/shared/edgeStats.ts';
import { ROOT, writeResult } from '../src/report/io.js';

// The periods the published statistics were produced under, before the split was
// modernised. Hardcoded here on purpose: this script must not follow periods.js.
const OLD = {
  development: { from: Date.UTC(2012, 4, 15), to: Date.UTC(2018, 11, 31, 23, 59, 59) },
  validation: { from: Date.UTC(2019, 0, 1), to: Date.UTC(2020, 11, 31, 23, 59, 59) },
  finalTest: { from: Date.UTC(2021, 0, 1), to: Date.UTC(2022, 2, 4, 23, 59, 59) },
};
const RISK = { accountSize: 10000, riskPerTradePct: 1, maxConcurrentTrades: 2, maxDailyLossPct: 3, maxWeeklyLossPct: 6 };
const SOLO = { ...RISK, maxConcurrentTrades: 1 };

const DIR = join(ROOT, 'data', 'normalized');
const ds = loadGoldDataset(DIR, 'legacy');
const ctx = buildContext({ m15: ds.m15, h1: ds.h1, h4: ds.h4, d1: ds.d1, macro: { dxy: ds.dxy } });
const events = buildCalendar(ds.h1.candles[0].openTime, ds.h1.candles.at(-1).closeTime);
const costNews = makeNewsWindow(events, { beforeMin: 10, afterMin: 20 });

const trades = (strategy, period, risk = RISK) => runBacktest({
  ctx, strategy, execution: 'realistic', risk, newsWindow: costNews,
  fromMs: period.from, toMs: period.to,
}).trades;
const M = (t) => computeMetrics(t, { accountSize: RISK.accountSize });

const checks = [];
const near = (actual, expected, tol, name, unit = '') => {
  const ok = actual != null && expected != null && Math.abs(actual - expected) <= tol;
  checks.push({ name, published: expected, reproduced: actual == null ? null : Math.round(actual * 10000) / 10000, tolerance: tol, pass: ok });
  console.log(`  [${ok ? 'MATCH' : 'DIFFERS'}] ${name.padEnd(52)} published=${expected}${unit}  reproduced=${actual == null ? 'n/a' : (Math.round(actual * 10000) / 10000)}${unit}`);
  return ok;
};

console.log(`Verifying against edgeStats generated ${EDGE_STATS.generatedAt}`);
console.log(`Published verdict: ${EDGE_STATS.verdict}\n`);

console.log('Production swing baseline, old final test 2021-01-01 → 2022-03-04:');
const baseFinal = M(trades(productionSwing(), OLD.finalTest));
const pubBaseFinal = EDGE_STATS.measured.strategies.BASELINE_SWING.finalTest;
near(baseFinal.trades, pubBaseFinal.trades, 0, 'baseline swing — trade count');
near(baseFinal.expectancy, pubBaseFinal.expectancy, 0.0005, 'baseline swing — expectancy', 'R');
near(baseFinal.profitFactor, pubBaseFinal.profitFactor, 0.002, 'baseline swing — profit factor');
near(baseFinal.winRate, pubBaseFinal.winRate, 0.02, 'baseline swing — win rate', '%');

console.log('\nProduction scalp tier, old final test:');
const scalpFinal = M(trades(productionScalp(), OLD.finalTest));
const pubScalpFinal = EDGE_STATS.measured.strategies.BASELINE_SCALP.finalTest;
near(scalpFinal.trades, pubScalpFinal.trades, 0, 'scalp — trade count');
near(scalpFinal.expectancy, pubScalpFinal.expectancy, 0.0005, 'scalp — expectancy', 'R');

console.log('\nEvery setup, pooled out-of-sample (old validation + old final test):');
for (const [id, pub] of Object.entries(EDGE_STATS.measured.setups)) {
  const oos = [
    ...trades(setupStrategy({ enabled: [id] }), OLD.validation, SOLO),
    ...trades(setupStrategy({ enabled: [id] }), OLD.finalTest, SOLO),
  ];
  const m = M(oos);
  const sig = significance(oos.map((t) => t.rMultiple));
  near(m.trades, pub.outOfSample.trades, 0, `${id} — OOS trades`);
  near(m.expectancy, pub.outOfSample.expectancy, 0.0005, `${id} — OOS expectancy`, 'R');
  near(sig.pBootstrap, pub.outOfSample.p, 0.02, `${id} — OOS p(edge<=0)`);
}

const passed = checks.filter((c) => c.pass).length;
console.log(`\n${passed}/${checks.length} published figures reproduced within tolerance.`);
if (passed !== checks.length) {
  console.log('\nFIGURES THAT DID NOT REPRODUCE:');
  for (const c of checks.filter((x) => !x.pass)) {
    console.log(`  ${c.name}: published ${c.published}, reproduced ${c.reproduced}`);
  }
}

writeResult('verification', {
  verifiedAgainst: { generatedAt: EDGE_STATS.generatedAt, verdict: EDGE_STATS.verdict, periods: EDGE_STATS.periods },
  feed: 'legacy',
  checks, passed, total: checks.length,
  conclusion: passed === checks.length
    ? 'Every published figure reproduced from source on the same feed and periods.'
    : 'At least one published figure did not reproduce; see checks[].',
}, { note: 'Independent reproduction of the previously committed statistics.' });
console.log('\n-> quant/results/verification.json');
