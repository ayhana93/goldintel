#!/usr/bin/env node
// Phases 18, 25, 29, 35 — the final evaluation and the dashboard data.
//
//   node quant/scripts/run-final.mjs
//
// Evaluates the frozen configurations on the final test period, reports every
// one of them including the losers, and checks whether the edge is decaying on
// the most recent slice of unseen data.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runIn, M, brief, RISK, SOLO_RISK, PERIODS } from '../src/research.js';
import * as S from '../src/backtest/strategies.js';
import { computeMetrics, groupMetrics, maeMfeStudy, equitySeries, rHistogram, monthlyBreakdown, significance } from '../src/backtest/metrics.js';
import { monteCarlo } from '../src/backtest/montecarlo.js';
import { classifyEdge } from '../src/backtest/edge.js';
import { SCENARIOS } from '../src/core/execution.js';
import { label } from '../src/periods.js';
import { writeResult, readResult, slimTrades, ROOT } from '../src/report/io.js';

const step = (m) => process.stdout.write(`\n=== ${m}\n`);
const r = (x, d = 4) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const LONGS = ['A_TREND_CONT_LONG', 'C_PULLBACK_LONG', 'E_RANGE_REV_LONG', 'G_BREAKOUT_LONG'];
const longFilter = (factory) => () => { const inner = factory(); return (a) => inner(a).filter((s) => s.direction === 'LONG'); };

const frozen = JSON.parse(readFileSync(join(ROOT, 'config', 'strategy-candidate.json'), 'utf8'));
const validation = readResult('validation');
if (!validation) throw new Error('Run quant/scripts/run-validate.mjs first.');

const STRATEGIES = {
  'baseline-long-only': { make: longFilter(() => S.productionSwing()), risk: RISK },
  'production-baseline': { make: () => S.productionSwing(), risk: RISK },
  'setups-long-only': { make: () => S.setupStrategy({ enabled: LONGS }), risk: SOLO_RISK },
  'setup-C-only': { make: () => S.setupStrategy({ enabled: ['C_PULLBACK_LONG'] }), risk: SOLO_RISK },
  'production-scalp': { make: () => S.productionScalp(), risk: RISK },
  'control-random-100pct-long': { make: () => S.matchedRandomBaseline({ probability: 0.02, longProbability: 1 }), risk: RISK },
  'control-random-5050': { make: () => S.randomEntryBaseline({ probability: 0.02 }), risk: RISK },
  'control-long-when-d1-bullish': { make: () => S.dailyBiasBaseline({ probability: 0.02, allowShort: false }), risk: RISK },
  'control-ema-cross': { make: () => S.emaCrossBaseline(), risk: RISK },
};
const primary = frozen.primary ?? 'baseline-long-only';

step(`Final test — ${label(PERIODS.finalTest)} (${PERIODS.finalTest.feed} feed), realistic costs`);
const finalRuns = {}, finalMetrics = {};
for (const [name, spec] of Object.entries(STRATEGIES)) {
  const t = runIn(PERIODS.finalTest, spec.make(), { risk: spec.risk }).trades;
  finalRuns[name] = t;
  finalMetrics[name] = M(t);
  console.log(`  ${name.padEnd(30)} ${JSON.stringify(brief(finalMetrics[name]))}`);
}

step('Every configuration across all three periods');
const acrossPeriods = {};
for (const name of Object.keys(STRATEGIES)) {
  acrossPeriods[name] = {};
  for (const [pn, p] of Object.entries(PERIODS)) {
    acrossPeriods[name][pn] = brief(M(runIn(p, STRATEGIES[name].make(), { risk: STRATEGIES[name].risk }).trades));
  }
}
for (const [name, per] of Object.entries(acrossPeriods)) {
  console.log(`  ${name.padEnd(30)} ` + Object.entries(per).map(([k, m]) => `${k.slice(0, 5)} ${String(m.trades).padStart(4)} ${(m.expectancy >= 0 ? '+' : '')}${m.expectancy.toFixed(3)}R`).join(' | '));
}

step(`Primary (${primary}) under every cost scenario, final test`);
const finalCostScenarios = {};
for (const s of Object.keys(SCENARIOS)) {
  finalCostScenarios[s] = M(runIn(PERIODS.finalTest, STRATEGIES[primary].make(), { risk: STRATEGIES[primary].risk, execution: s }).trades);
  console.log(`  ${s.padEnd(14)} ${JSON.stringify(brief(finalCostScenarios[s]))}`);
}

step('Conditional breakdown of the primary on the final test');
const pTrades = finalRuns[primary];
const G = (fn) => groupMetrics(pTrades, fn, { accountSize: RISK.accountSize });
const finalConditional = {
  byDirection: G((t) => t.direction),
  byRegime: G((t) => t.meta.regime),
  bySession: G((t) => t.meta.session),
  byVolState: G((t) => t.meta.volState),
  byNews: G((t) => (t.meta.inNews ? 'IN_NEWS_WINDOW' : 'OUTSIDE')),
};
for (const [k, obj] of Object.entries(finalConditional)) {
  const rows = Object.entries(obj).filter(([, m]) => m.trades >= 10).sort((a, b) => b[1].expectancy - a[1].expectancy);
  console.log(`  ${k}: ` + rows.map(([g, m]) => `${g} n=${m.trades} ${(m.expectancy >= 0 ? '+' : '')}${m.expectancy.toFixed(3)}R`).join('  |  '));
}

// ---------------------------------------------------------------- EDGE_DECAY
step('EDGE_DECAY — is the most recent unseen year still performing?');
// Split the final test into its calendar years and compare the newest against
// the pooled out-of-sample expectation. A strategy whose edge is fading shows it
// here first.
const years = {};
for (let y = 2023; y <= 2025; y++) {
  const t = runIn({ from: Date.UTC(y, 0, 1), to: Date.UTC(y, 11, 31, 23, 59, 59), feed: 'modern' }, STRATEGIES[primary].make(), { risk: STRATEGIES[primary].risk }).trades;
  years[y] = { ...brief(M(t)) };
  console.log(`  ${y}  ${JSON.stringify(years[y])}`);
}
const oosT = [
  ...runIn(PERIODS.validation, STRATEGIES[primary].make(), { risk: STRATEGIES[primary].risk }).trades,
  ...runIn(PERIODS.finalTest, STRATEGIES[primary].make(), { risk: STRATEGIES[primary].risk }).trades,
];
const oosM = M(oosT);
const oosSig = significance(oosT.map((t) => t.rMultiple));
const latest = years[2025];
const latestSE = latest.trades > 1 && oosM.significance?.se ? oosM.significance.se * Math.sqrt(oosM.trades / latest.trades) : null;
const z = latestSE ? (latest.expectancy - oosM.expectancy) / latestSE : null;
const decay = {
  latestYear: 2025, latest, pooledOutOfSample: brief(oosM),
  zScore: r(z, 2),
  status: z == null ? 'UNKNOWN' : z <= -2 ? 'EDGE_DECAY' : z <= -1 ? 'WATCH' : 'IN_LINE',
};
console.log(`  most recent year vs pooled out-of-sample: z = ${decay.zScore}  ->  ${decay.status}`);

step('Monte Carlo on the primary\'s final-test trades');
const finalMc = monteCarlo(pTrades, { runs: 5000, mode: 'bootstrap', riskPct: 1, ruinPct: 50, tradesPerYear: 75 });
console.log(`  positive ${r(finalMc.finalR?.pctPositive, 1)}%  negative-year ${r(finalMc.probabilityOfNegativeYear?.pct, 1)}%  median DD ${r(finalMc.drawdownR?.median, 1)}R  ruin ${r(finalMc.probabilityOfRuin?.pct, 2)}%`);

step('Phase 29 — final edge classification');
const verdicts = {};
for (const name of ['baseline-long-only', 'production-baseline', 'setups-long-only', 'setup-C-only']) {
  const oos = [
    ...runIn(PERIODS.validation, STRATEGIES[name].make(), { risk: STRATEGIES[name].risk }).trades,
    ...runIn(PERIODS.finalTest, STRATEGIES[name].make(), { risk: STRATEGIES[name].risk }).trades,
  ];
  verdicts[name] = classifyEdge({
    outOfSample: computeMetrics(oos, { accountSize: RISK.accountSize }),
    inSample: M(runIn(PERIODS.development, STRATEGIES[name].make(), { risk: STRATEGIES[name].risk }).trades),
    walkForward: validation.walkForward.summary,
    sensitivity: validation.sensitivity,
    costScenarios: name === primary ? finalCostScenarios : undefined,
  });
  console.log(`  ${name.padEnd(30)} ${verdicts[name].verdict} (${verdicts[name].passed}/${verdicts[name].total})`);
}
const overall = verdicts[primary];
console.log('\n  Checks for the primary:');
for (const c of overall.checks) console.log(`    [${c.pass ? 'PASS' : 'FAIL'}] ${c.name.padEnd(38)} actual=${c.actual} required ${c.required}`);
console.log(`\n  FINAL VERDICT: ${overall.verdict}`);

writeResult('final-test', {
  period: `${label(PERIODS.finalTest)} (${PERIODS.finalTest.feed} feed)`,
  primary, finalMetrics: Object.fromEntries(Object.entries(finalMetrics).map(([k, v]) => [k, brief(v)])),
  acrossPeriods, finalCostScenarios: Object.fromEntries(Object.entries(finalCostScenarios).map(([k, v]) => [k, brief(v)])),
  finalConditional, maeMfe: maeMfeStudy(pTrades), monteCarlo: finalMc,
  edgeDecay: decay,
  outOfSample: { ...brief(oosM), ci95: oosSig.ci95?.map((x) => r(x, 4)) },
  verdicts, finalVerdict: overall.verdict,
}, { note: 'Frozen configurations evaluated on the final test. Nothing was selected using this period.' });

// The dashboard is a web page, not an archive: downsample long equity curves so
// the bundle stays reasonable. The full series live in trades-final.json.
const downsample = (series, max = 400) => {
  if (series.length <= max) return series;
  const stride = Math.ceil(series.length / max);
  const out = series.filter((_, i) => i % stride === 0);
  if (out[out.length - 1] !== series[series.length - 1]) out.push(series[series.length - 1]);
  return out;
};

writeResult('dashboard', {
  primary,
  verdict: overall.verdict,
  periods: Object.fromEntries(Object.entries(PERIODS).map(([k, v]) => [k, `${label(v)} (${v.feed})`])),
  overview: Object.fromEntries(Object.entries(finalMetrics).map(([k, v]) => [k, brief(v)])),
  acrossPeriods,
  equity: Object.fromEntries(Object.entries(finalRuns).map(([k, t]) => [k, downsample(equitySeries(t, { accountSize: RISK.accountSize }))])),
  histogram: Object.fromEntries(Object.entries(finalRuns).map(([k, t]) => [k, rHistogram(t)])),
  monthly: monthlyBreakdown(pTrades, { accountSize: RISK.accountSize }),
  conditional: finalConditional,
  edgeDecay: decay,
  calibration: validation.calibration,
  walkForward: validation.walkForward,
  verdicts,
});
writeResult('trades-final', { trades: slimTrades(pTrades) }, { strategy: primary, period: label(PERIODS.finalTest) });
console.log('\n-> quant/results/final-test.json, dashboard.json, trades-final.json');
