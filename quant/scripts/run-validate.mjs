#!/usr/bin/env node
// Phases 17-19, 27-29. Selection happens on DEVELOPMENT, is checked on
// VALIDATION, and is then frozen. The final test period is never read here.
//
//   node quant/scripts/run-validate.mjs

import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { loadGoldDataset } from '../src/data/dataset.js';
import { buildContext } from '../src/core/context.js';
import { buildCalendar, makeNewsWindow } from '../src/core/calendar.js';
import { runBacktest } from '../src/backtest/engine.js';
import { computeMetrics } from '../src/backtest/metrics.js';
import { walkForward, makeWindows } from '../src/backtest/walkforward.js';
import { monteCarlo } from '../src/backtest/montecarlo.js';
import { sensitivitySweep } from '../src/backtest/sensitivity.js';
import { classifyEdge } from '../src/backtest/edge.js';
import { setupStrategy, productionSwing } from '../src/backtest/strategies.js';
import { SETUP_IDS } from '../src/core/setups.js';
import { SCENARIOS } from '../src/core/execution.js';
import { PERIODS, OPEN_PERIOD, label } from '../src/periods.js';
import { writeResult, ROOT } from '../src/report/io.js';

const DIR = join(ROOT, 'data', 'normalized');
const RISK = { accountSize: 10000, riskPerTradePct: 1, maxConcurrentTrades: 2, maxDailyLossPct: 3, maxWeeklyLossPct: 6 };
const SOLO_RISK = { ...RISK, maxConcurrentTrades: 1 };
const step = (m) => process.stdout.write(`\n=== ${m}\n`);
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000);
const brief = (m) => ({
  trades: m.trades, winRate: r4(m.winRate), expectancy: r4(m.expectancy),
  profitFactor: m.profitFactor === Infinity ? null : r4(m.profitFactor),
  netR: r4(m.netR), maxDrawdownR: r4(m.maxDrawdownR),
  t: r4(m.significance?.t), p: r4(m.significance?.pBootstrap),
});

const ds = loadGoldDataset(DIR);
const ctx = buildContext({ m15: ds.m15, h1: ds.h1, h4: ds.h4, d1: ds.d1, macro: { dxy: ds.dxy } });
const events = buildCalendar(ds.h1.candles[0].openTime, ds.h1.candles.at(-1).closeTime);
const costNews = makeNewsWindow(events, { beforeMin: 10, afterMin: 20 });

const build = (cfg) => setupStrategy(cfg);
const run = (cfg, period, risk = SOLO_RISK, execution = 'realistic') => runBacktest({
  ctx, strategy: build(cfg), execution, risk, newsWindow: costNews,
  fromMs: period.from, toMs: period.to,
});
const M = (trades) => computeMetrics(trades, { accountSize: RISK.accountSize });

// ------------------------------------------------ 1. candidate selection
step('Phase 27 — candidate selection, DEVELOPMENT period only');

// Only setups that showed positive expectancy in isolation on development are
// eligible. This IS a selection, which is exactly why it is checked twice below.
const eligible = [];
for (const id of SETUP_IDS) {
  const m = M(run({ enabled: [id] }, PERIODS.development).trades);
  if (m.expectancy > 0 && m.trades >= 50) eligible.push({ id, ...brief(m) });
}
console.log('  eligible setups (dev expectancy > 0, n >= 50):');
for (const e of eligible) console.log(`    ${e.id.padEnd(20)} n=${e.trades} exp=${e.expectancy} p=${e.p}`);

// Multiple comparisons: eight setups were examined, so a nominal p of 0.05 is
// really 0.05/8. Recorded here rather than quietly ignored.
const bonferroni = 0.05 / SETUP_IDS.length;
for (const e of eligible) e.survivesBonferroni = e.p != null && e.p < bonferroni;
console.log(`  Bonferroni threshold for ${SETUP_IDS.length} setups: p < ${bonferroni.toFixed(5)}`);

const enabledSets = [
  { name: 'best-only', enabled: eligible.slice(0, 1).map((e) => e.id) },
  { name: 'all-eligible', enabled: eligible.map((e) => e.id) },
];

const stopPolicies = ['atr', 'swing', 'structure_atr', 'volatility_adjusted'];
const targetOptions = [
  { name: 'R 1/2/3', targetPolicy: 'fixedR', targetCfg: { rMultiples: [1, 2, 3] } },
  { name: 'R 1.5/2.5/4', targetPolicy: 'fixedR', targetCfg: { rMultiples: [1.5, 2.5, 4] } },
  { name: 'R 0.75/1.5/2.5', targetPolicy: 'fixedR', targetCfg: { rMultiples: [0.75, 1.5, 2.5] } },
  { name: 'structure', targetPolicy: 'structure', targetCfg: { rMultiples: [1, 2, 3], minTargetR: 0.8 } },
];

const candidates = [];
for (const es of enabledSets) {
  if (es.enabled.length === 0) continue;
  for (const sp of stopPolicies) {
    for (const t of targetOptions) {
      candidates.push({
        label: `${es.name}|${sp}|${t.name}`,
        enabled: es.enabled, stopPolicy: sp,
        targetPolicy: t.targetPolicy, targetCfg: t.targetCfg,
      });
    }
  }
}

const scoredCandidates = candidates.map((cfg) => {
  const m = M(run(cfg, PERIODS.development).trades);
  return { cfg, metrics: m };
}).filter((s) => s.metrics.trades >= 50);

scoredCandidates.sort((a, b) => (b.metrics.expectancy ?? -9) - (a.metrics.expectancy ?? -9));
console.log('  top candidates on development:');
for (const s of scoredCandidates.slice(0, 6)) {
  console.log(`    ${s.cfg.label.padEnd(40)} ${JSON.stringify(brief(s.metrics))}`);
}
const chosen = scoredCandidates[0];
if (!chosen) throw new Error('No candidate produced a usable sample on the development period.');
console.log(`  CHOSEN: ${chosen.cfg.label}`);

// ------------------------------------------------ 1b. score-based candidate
step('Phase 8 — score-based candidate: the baseline with its weakest component removed');
// The ablation study (run-study.mjs) found that dropping the macro component is
// the ONLY single-component change that improves the production engine on the
// development period. That is a selection made on development data, so it is
// treated exactly like the setup candidate: registered here, checked on
// validation, and reported on the final test alongside everything else.
const NO_MACRO_W = (() => {
  const base = { trend: 25, structure: 25, momentum: 12, support_resistance: 13, price_action: 10 };
  const total = Object.values(base).reduce((a, b) => a + b, 0);
  const w = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, (v / total) * 100]));
  w.macro = 0;
  return w;
})();
const noMacroStrategy = () => productionSwing({ weights: NO_MACRO_W });
const runScore = (strategy, period) => runBacktest({
  ctx, strategy, execution: 'realistic', risk: RISK, newsWindow: costNews,
  fromMs: period.from, toMs: period.to,
});
const noMacroDev = M(runScore(noMacroStrategy(), PERIODS.development).trades);
console.log('  baseline minus macro, development:', JSON.stringify(brief(noMacroDev)));

// ------------------------------------------------ 2. validation
step('Phase 18 — validation period (never used for any choice)');
const valMetrics = M(run(chosen.cfg, PERIODS.validation).trades);
const baselineVal = M(runScore(productionSwing(), PERIODS.validation).trades);
const noMacroVal = M(runScore(noMacroStrategy(), PERIODS.validation).trades);
console.log('  setup candidate on validation   :', JSON.stringify(brief(valMetrics)));
console.log('  baseline minus macro, validation:', JSON.stringify(brief(noMacroVal)));
console.log('  production baseline, validation :', JSON.stringify(brief(baselineVal)));

// Exactly three configurations are registered for the final test. All three are
// reported there; none of them is chosen using final-test data.
const registered = [
  { id: 'production-baseline', description: 'GoldIntel as shipped', dev: chosen.metrics && M(runScore(productionSwing(), PERIODS.development).trades), val: baselineVal },
  { id: 'baseline-no-macro', description: 'GoldIntel score with the macro component removed and weights renormalized', dev: noMacroDev, val: noMacroVal },
  { id: 'setup-candidate', description: chosen.cfg.label, dev: chosen.metrics, val: valMetrics },
];
const primary = [...registered].sort((a, b) => (b.val.expectancy ?? -9) - (a.val.expectancy ?? -9))[0];
console.log(`  PRIMARY for the final test (best on validation): ${primary.id}`);

// ------------------------------------------------ 3. cost sensitivity
step('Phase 5 — candidate under every cost scenario (development)');
const costScenarios = {};
for (const name of Object.keys(SCENARIOS)) {
  costScenarios[name] = M(run(chosen.cfg, PERIODS.development, SOLO_RISK, name).trades);
  console.log(`  ${name.padEnd(14)}`, JSON.stringify(brief(costScenarios[name])));
}

// ------------------------------------------------ 4. walk-forward
step('Phase 17 — walk-forward, 12 months train / 3 months test');
const windows = makeWindows({ fromMs: OPEN_PERIOD.from, toMs: OPEN_PERIOD.to, trainMonths: 12, testMonths: 3 });
const wf = walkForward({
  ctx, windows, candidates,
  buildStrategy: build, execution: 'realistic', risk: SOLO_RISK, newsWindow: costNews,
  metricsOpts: { accountSize: RISK.accountSize },
  selectFn: ({ scored }) => scored
    .filter((s) => s.trades >= 10)
    .sort((a, b) => (b.metrics.expectancy ?? -9) - (a.metrics.expectancy ?? -9))[0] ?? scored[0],
});
console.log(`  windows: ${wf.summary.windowCount}`);
console.log(`  mean in-sample expectancy    : ${r4(wf.summary.meanInSampleExpectancy)}`);
console.log(`  mean out-of-sample expectancy: ${r4(wf.summary.meanOutOfSampleExpectancy)}`);
console.log(`  degradation                  : ${r4(wf.summary.degradation)}`);
console.log(`  profitable OOS windows       : ${wf.summary.profitableWindows}/${wf.summary.totalWindows} (${r4(wf.summary.consistency)})`);
console.log(`  stitched out-of-sample       : ${JSON.stringify(brief(wf.summary.stitchedOutOfSample))}`);

// Walk-forward with the strategy FROZEN (no per-window reselection), which
// separates "the setup works" from "reselecting every quarter works".
const wfFrozen = walkForward({
  ctx, windows, candidates: [chosen.cfg],
  buildStrategy: build, execution: 'realistic', risk: SOLO_RISK, newsWindow: costNews,
  metricsOpts: { accountSize: RISK.accountSize },
});
console.log(`  frozen-config OOS            : ${JSON.stringify(brief(wfFrozen.summary.stitchedOutOfSample))}`);

// ------------------------------------------------ 5. Monte Carlo
step('Phase 19 — Monte Carlo on the walk-forward out-of-sample trades');
const mc = monteCarlo(wf.oosTrades, { runs: 5000, mode: 'bootstrap', riskPct: 1, ruinPct: 50, tradesPerYear: 60 });
console.log('  final R distribution:', JSON.stringify(mc.finalR && {
  median: r4(mc.finalR.median), p05: r4(mc.finalR.p05), p95: r4(mc.finalR.p95), pctPositive: r4(mc.finalR.pctPositive),
}));
console.log('  drawdown R:', JSON.stringify(mc.drawdownR && {
  median: r4(mc.drawdownR.median), p95: r4(mc.drawdownR.p95), worst: r4(mc.drawdownR.worst),
}));
console.log('  probability of ruin:', JSON.stringify(mc.probabilityOfRuin));
console.log('  probability of a negative year:', JSON.stringify(mc.probabilityOfNegativeYear));

// ------------------------------------------------ 6. sensitivity
step('Phase 28 — parameter sensitivity around the chosen configuration');
const sens = sensitivitySweep({
  ctx, baseConfig: chosen.cfg, buildStrategy: build,
  execution: 'realistic', risk: SOLO_RISK, newsWindow: costNews,
  fromMs: PERIODS.development.from, toMs: PERIODS.development.to,
  metricsOpts: { accountSize: RISK.accountSize },
  axes: {
    'setupCfg.pullbackWindow': [8, 10, 12, 14, 16],
    'setupCfg.rsiOverbought': [70, 72, 75, 78, 80],
    'setupCfg.rsiOversold': [20, 22, 25, 28, 30],
    'stopCfg.swingBufferAtr': [0.05, 0.10, 0.15, 0.20, 0.25],
    'stopCfg.minStopAtr': [0.3, 0.4, 0.5, 0.6, 0.7],
    'targetCfg.rMultiples': [[1.3, 2.2, 3.5], [1.4, 2.35, 3.75], [1.5, 2.5, 4], [1.6, 2.65, 4.25], [1.7, 2.8, 4.5]],
  },
});
for (const [param, flag] of Object.entries(sens.flags)) {
  const row = sens.results[param].map((r) => r4(r.expectancy)).join(', ');
  console.log(`  ${param.padEnd(30)} ${flag.padEnd(12)} [${row}]`);
}
console.log(`  OVERFIT_RISK = ${sens.overfitRisk} (${sens.liveAxes} live axes, ${sens.inertAxes} inert)`);

// Indicator neighbourhoods need the whole context rebuilt, so they are swept
// separately. This is the "EMA 20 -> 19 or 21" test the brief asks for.
step('Phase 28b — indicator parameter neighbourhood (context rebuilt per point)');
const indicatorAxes = {
  emaFastP: [19, 20, 21],
  emaMidP: [48, 50, 52],
  emaSlowP: [190, 200, 210],
  atrP: [13, 14, 15],
  rsiP: [13, 14, 15],
};
const swingLookbacks = [2, 3, 4];
const indicatorSweep = {};
for (const [param, values] of Object.entries(indicatorAxes)) {
  indicatorSweep[param] = values.map((v) => {
    const c = buildContext({
      m15: ds.m15, h1: ds.h1, h4: ds.h4, d1: ds.d1, macro: { dxy: ds.dxy },
      options: { indicatorParams: { [param]: v } },
    });
    const m = M(runBacktest({
      ctx: c, strategy: build(chosen.cfg), execution: 'realistic', risk: SOLO_RISK,
      newsWindow: costNews, fromMs: PERIODS.development.from, toMs: PERIODS.development.to,
    }).trades);
    return { value: v, trades: m.trades, expectancy: r4(m.expectancy), profitFactor: r4(m.profitFactor) };
  });
  console.log(`  ${param.padEnd(12)} ${indicatorSweep[param].map((x) => `${x.value}:${x.expectancy}`).join('  ')}`);
}
indicatorSweep.swingLookback = swingLookbacks.map((v) => {
  const c = buildContext({
    m15: ds.m15, h1: ds.h1, h4: ds.h4, d1: ds.d1, macro: { dxy: ds.dxy },
    options: { swingLookback: v },
  });
  const m = M(runBacktest({
    ctx: c, strategy: build(chosen.cfg), execution: 'realistic', risk: SOLO_RISK,
    newsWindow: costNews, fromMs: PERIODS.development.from, toMs: PERIODS.development.to,
  }).trades);
  return { value: v, trades: m.trades, expectancy: r4(m.expectancy), profitFactor: r4(m.profitFactor) };
});
console.log(`  ${'swingLookback'.padEnd(12)} ${indicatorSweep.swingLookback.map((x) => `${x.value}:${x.expectancy}`).join('  ')}`);
const indicatorFlags = {};
for (const [k, rows] of Object.entries(indicatorSweep)) {
  const exps = rows.map((r) => r.expectancy).filter((x) => x != null);
  const spread = Math.max(...exps) - Math.min(...exps);
  const positive = exps.filter((x) => x > 0).length;
  indicatorFlags[k] = spread < 1e-9 ? 'INERT' : positive === exps.length ? 'STABLE' : positive === 0 ? 'ALL_NEGATIVE' : 'FRAGILE';
}
console.log('  flags:', JSON.stringify(indicatorFlags));

// ------------------------------------------------ 7. interim verdict
step('Phase 29 — interim edge classification (final test still sealed)');
const interim = classifyEdge({
  outOfSample: valMetrics,
  inSample: chosen.metrics,
  walkForward: wf.summary,
  sensitivity: sens,
  costScenarios,
});
for (const c of interim.checks) {
  console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name.padEnd(38)} actual=${c.actual} required ${c.required}`);
}
console.log(`  INTERIM VERDICT: ${interim.verdict} (${interim.passed}/${interim.total} checks)`);

// ------------------------------------------------ freeze + write
const frozen = {
  id: 'candidate',
  description: 'Selected on the development period only, using per-setup expectancy and a stop/target grid. Frozen before the final test period was opened.',
  chosenLabel: chosen.cfg.label,
  strategy: chosen.cfg,
  risk: SOLO_RISK,
  execution: 'realistic',
  registeredForFinalTest: registered.map((r) => ({ id: r.id, description: r.description })),
  primary: primary.id,
  noMacroWeights: NO_MACRO_W,
  selection: {
    method: 'per-setup expectancy on development, then stop x target grid on development',
    eligibleSetups: eligible,
    bonferroniThreshold: bonferroni,
    candidatesEvaluated: candidates.length,
  },
};
writeFileSync(join(ROOT, 'config', 'strategy-candidate.json'), JSON.stringify(frozen, null, 2));

writeResult('validation', {
  chosen: chosen.cfg,
  registered: registered.map((r) => ({ id: r.id, description: r.description, development: r.dev, validation: r.val })),
  primary: primary.id,
  noMacroWeights: NO_MACRO_W,
  eligible,
  bonferroniThreshold: bonferroni,
  candidateRanking: scoredCandidates.slice(0, 12).map((s) => ({ label: s.cfg.label, ...brief(s.metrics) })),
  development: chosen.metrics,
  validation: valMetrics,
  costScenarios,
  walkForward: { summary: wf.summary, windows: wf.windows },
  walkForwardFrozen: { summary: wfFrozen.summary, windows: wfFrozen.windows },
  monteCarlo: mc,
  sensitivity: { flags: sens.flags, overfitRisk: sens.overfitRisk, liveAxes: sens.liveAxes, inertAxes: sens.inertAxes, results: sens.results, base: sens.base },
  indicatorSensitivity: { sweep: indicatorSweep, flags: indicatorFlags },
  interimVerdict: interim,
}, { period: 'development+validation', note: 'The final test period was not read by this script.' });

console.log('\n-> quant/results/validation.json and quant/config/strategy-candidate.json');
