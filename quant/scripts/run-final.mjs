#!/usr/bin/env node
// Phase 18/29/35 — THE FINAL TEST.
//
// This is the only script in the repository that reads PERIODS.finalTest. It is
// meant to be run once, at the end, on configurations that were frozen before it
// ran. It selects nothing. All three registered configurations are reported,
// including the ones that do badly.
//
//   node quant/scripts/run-final.mjs

import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadGoldDataset } from '../src/data/dataset.js';
import { buildContext } from '../src/core/context.js';
import { buildCalendar, makeNewsWindow } from '../src/core/calendar.js';
import { runBacktest } from '../src/backtest/engine.js';
import { computeMetrics, groupMetrics, maeMfeStudy, equitySeries, rHistogram, monthlyBreakdown } from '../src/backtest/metrics.js';
import { monteCarlo } from '../src/backtest/montecarlo.js';
import { classifyEdge } from '../src/backtest/edge.js';
import {
  productionSwing, productionScalp, setupStrategy,
  emaCrossBaseline, trendFollowBaseline, randomEntryBaseline,
} from '../src/backtest/strategies.js';
import { SCENARIOS } from '../src/core/execution.js';
import { PERIODS, label } from '../src/periods.js';
import { writeResult, readResult, slimTrades, ROOT } from '../src/report/io.js';

const DIR = join(ROOT, 'data', 'normalized');
const RISK = { accountSize: 10000, riskPerTradePct: 1, maxConcurrentTrades: 2, maxDailyLossPct: 3, maxWeeklyLossPct: 6 };
const SOLO_RISK = { ...RISK, maxConcurrentTrades: 1 };
const step = (m) => process.stdout.write(`\n=== ${m}\n`);
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000);
const brief = (m) => ({
  trades: m.trades, winRate: r4(m.winRate), expectancy: r4(m.expectancy),
  profitFactor: m.profitFactor === Infinity ? null : r4(m.profitFactor),
  netR: r4(m.netR), netPnl: r4(m.netPnl), maxDrawdownR: r4(m.maxDrawdownR), maxDrawdownPct: r4(m.maxDrawdownPct),
  sharpe: r4(m.sharpe), t: r4(m.significance?.t), p: r4(m.significance?.pBootstrap),
});

const frozen = JSON.parse(readFileSync(join(ROOT, 'config', 'strategy-candidate.json'), 'utf8'));
const validation = readResult('validation');
if (!validation) throw new Error('Run quant/scripts/run-validate.mjs first: the final test may only evaluate frozen configurations.');

console.log(`Frozen candidate : ${frozen.chosenLabel}`);
console.log(`Registered       : ${frozen.registeredForFinalTest.map((r) => r.id).join(', ')}`);
console.log(`Primary          : ${frozen.primary}`);
console.log(`FINAL TEST PERIOD: ${label(PERIODS.finalTest)}  — opened now, for the first time.`);

const ds = loadGoldDataset(DIR);
const ctx = buildContext({ m15: ds.m15, h1: ds.h1, h4: ds.h4, d1: ds.d1, macro: { dxy: ds.dxy } });
const events = buildCalendar(ds.h1.candles[0].openTime, ds.h1.candles.at(-1).closeTime);
const costNews = makeNewsWindow(events, { beforeMin: 10, afterMin: 20 });

const STRATEGIES = {
  'production-baseline': { fn: () => productionSwing(), risk: RISK },
  'baseline-no-macro': { fn: () => productionSwing({ weights: frozen.noMacroWeights }), risk: RISK },
  'setup-candidate': { fn: () => setupStrategy(frozen.strategy), risk: SOLO_RISK },
  'production-scalp': { fn: () => productionScalp(), risk: RISK },
  'control-ema-cross': { fn: () => emaCrossBaseline(), risk: RISK },
  'control-trend-follow': { fn: () => trendFollowBaseline(), risk: RISK },
  'control-random-entry': { fn: () => randomEntryBaseline({ probability: 0.02 }), risk: RISK },
};

const go = (name, period, execution = 'realistic') => runBacktest({
  ctx, strategy: STRATEGIES[name].fn(), execution, risk: STRATEGIES[name].risk,
  newsWindow: costNews, fromMs: period.from, toMs: period.to,
});
const M = (trades) => computeMetrics(trades, { accountSize: RISK.accountSize });

step(`Final test — ${label(PERIODS.finalTest)}, realistic costs`);
const finalRuns = {};
const finalMetrics = {};
for (const name of Object.keys(STRATEGIES)) {
  const r = go(name, PERIODS.finalTest);
  finalRuns[name] = r;
  finalMetrics[name] = M(r.trades);
  console.log(`  ${name.padEnd(22)}`, JSON.stringify(brief(finalMetrics[name])));
}

step('Same configurations across every period, for comparison');
const acrossPeriods = {};
for (const name of ['production-baseline', 'baseline-no-macro', 'setup-candidate', 'production-scalp']) {
  acrossPeriods[name] = {
    development: M(go(name, PERIODS.development).trades),
    validation: M(go(name, PERIODS.validation).trades),
    finalTest: finalMetrics[name],
  };
  console.log(`  ${name}`);
  for (const [p, m] of Object.entries(acrossPeriods[name])) {
    console.log(`    ${p.padEnd(12)} ${JSON.stringify(brief(m))}`);
  }
}

const primary = frozen.primary;
step(`Primary configuration (${primary}) under every cost scenario, final test`);
const finalCostScenarios = {};
for (const s of Object.keys(SCENARIOS)) {
  finalCostScenarios[s] = M(go(primary, PERIODS.finalTest, s).trades);
  console.log(`  ${s.padEnd(14)}`, JSON.stringify(brief(finalCostScenarios[s])));
}

step('Conditional breakdown of the primary configuration on the final test');
const pTrades = finalRuns[primary].trades;
const G = (fn) => groupMetrics(pTrades, fn, { accountSize: RISK.accountSize });
const finalConditional = {
  byDirection: G((t) => t.direction),
  byRegime: G((t) => t.meta.regime),
  bySession: G((t) => t.meta.session),
  byVolState: G((t) => t.meta.volState),
  byNews: G((t) => (t.meta.inNews ? 'IN_NEWS_WINDOW' : 'OUTSIDE')),
};
for (const [k, obj] of Object.entries(finalConditional)) {
  console.log(`  ${k}`);
  for (const [g, m] of Object.entries(obj)) {
    if (m.trades < 5) continue;
    console.log(`    ${g.padEnd(20)} n=${String(m.trades).padStart(4)} exp=${String(r4(m.expectancy)).padStart(9)} pf=${String(r4(m.profitFactor)).padStart(7)}`);
  }
}

step('Monte Carlo on the final-test trades of the primary configuration');
const finalMc = monteCarlo(pTrades, { runs: 5000, mode: 'bootstrap', riskPct: 1, ruinPct: 50, tradesPerYear: 60 });
console.log('  ', JSON.stringify({
  medianFinalR: r4(finalMc.finalR?.median), pctPositive: r4(finalMc.finalR?.pctPositive),
  medianDD: r4(finalMc.drawdownR?.median), p95DD: r4(finalMc.drawdownR?.p95),
  pRuin: r4(finalMc.probabilityOfRuin?.pct), pNegativeYear: r4(finalMc.probabilityOfNegativeYear?.pct),
}));

step('Phase 29 — final edge classification');
const verdicts = {};
for (const name of ['production-baseline', 'baseline-no-macro', 'setup-candidate']) {
  const v = classifyEdge({
    outOfSample: finalMetrics[name],
    inSample: acrossPeriods[name].development,
    walkForward: validation.walkForward.summary,
    sensitivity: validation.sensitivity,
    costScenarios: name === primary ? finalCostScenarios : undefined,
  });
  verdicts[name] = v;
  console.log(`  ${name.padEnd(22)} ${v.verdict}  (${v.passed}/${v.total})`);
}
const overall = verdicts[primary];
console.log('\n  Checks for the primary configuration:');
for (const c of overall.checks) {
  console.log(`    [${c.pass ? 'PASS' : 'FAIL'}] ${c.name.padEnd(38)} actual=${c.actual} required ${c.required}`);
}
console.log(`\n  FINAL VERDICT: ${overall.verdict}`);

writeResult('final-test', {
  period: label(PERIODS.finalTest),
  frozenConfig: { chosenLabel: frozen.chosenLabel, primary, registered: frozen.registeredForFinalTest },
  finalMetrics,
  acrossPeriods,
  finalCostScenarios,
  finalConditional,
  maeMfe: maeMfeStudy(pTrades),
  monteCarlo: finalMc,
  verdicts,
  finalVerdict: overall.verdict,
}, { period: 'FINAL TEST', note: 'Evaluated once, on frozen configurations. Nothing was selected using this period.' });

writeResult('dashboard', {
  primary,
  periods: {
    development: label(PERIODS.development),
    validation: label(PERIODS.validation),
    finalTest: label(PERIODS.finalTest),
  },
  overview: finalMetrics,
  acrossPeriods,
  equity: Object.fromEntries(Object.entries(finalRuns).map(([k, r]) => [k, equitySeries(r.trades, { accountSize: RISK.accountSize })])),
  histogram: Object.fromEntries(Object.entries(finalRuns).map(([k, r]) => [k, rHistogram(r.trades)])),
  monthly: monthlyBreakdown(pTrades, { accountSize: RISK.accountSize }),
  conditional: finalConditional,
  verdicts,
});

writeResult('trades-final', { trades: slimTrades(pTrades) }, { strategy: primary, period: label(PERIODS.finalTest) });

writeFileSync(join(ROOT, 'config', 'strategy-final.json'), JSON.stringify({
  id: 'final',
  description: 'The configuration carried into the final test, frozen beforehand. Recorded regardless of the verdict.',
  primary,
  registered: frozen.registeredForFinalTest,
  strategy: frozen.strategy,
  noMacroWeights: frozen.noMacroWeights,
  risk: RISK,
  verdict: overall.verdict,
  evaluatedAt: new Date().toISOString(),
}, null, 2));

console.log('\n-> quant/results/final-test.json, dashboard.json, trades-final.json');
