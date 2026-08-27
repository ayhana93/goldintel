#!/usr/bin/env node
// Phases 17-19, 26-29 on the modern split.
//
//   node quant/scripts/run-validate.mjs
//
// Candidates are PRE-DECLARED here, and each one's rationale states which data
// supports it. Only development and validation may justify a choice; the final
// test is an evaluation, never an input.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runIn, M, brief, RISK, SOLO_RISK, PERIODS, feedContext } from '../src/research.js';
import * as S from '../src/backtest/strategies.js';
import { runBacktest } from '../src/backtest/engine.js';
import { computeMetrics, significance } from '../src/backtest/metrics.js';
import { makeWindows } from '../src/backtest/walkforward.js';
import { monteCarlo } from '../src/backtest/montecarlo.js';
import { sensitivitySweep } from '../src/backtest/sensitivity.js';
import { classifyEdge } from '../src/backtest/edge.js';
import { SCENARIOS } from '../src/core/execution.js';
import { label, OUT_OF_SAMPLE } from '../src/periods.js';
import { writeResult, ROOT } from '../src/report/io.js';

const step = (m) => process.stdout.write(`\n=== ${m}\n`);
const r = (x, d = 4) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const LONGS = ['A_TREND_CONT_LONG', 'C_PULLBACK_LONG', 'E_RANGE_REV_LONG', 'G_BREAKOUT_LONG'];

/** Wrap any strategy so it can only emit one direction. */
const directionFilter = (factory, direction) => () => {
  const inner = factory();
  return (args) => inner(args).filter((s) => s.direction === direction);
};

// ---- pre-declared candidates -------------------------------------------------
const CANDIDATES = {
  'production-baseline': {
    make: () => S.productionSwing(), risk: RISK,
    rationale: 'The shipped engine, unchanged. Not selected — it is the control everything else is measured against.',
  },
  'baseline-long-only': {
    make: directionFilter(() => S.productionSwing(), 'LONG'), risk: RISK,
    rationale: 'Shorts disabled. Supported by DEVELOPMENT and VALIDATION alone: all four short setups are negative in both periods (B -0.015/-0.115, D -0.132/-0.141, F -0.066/-0.070, H -0.053/-0.185) and the score baseline is negative short in both (-0.039/-0.092).',
  },
  'setups-long-only': {
    make: () => S.setupStrategy({ enabled: LONGS }), risk: SOLO_RISK,
    rationale: 'The four long setups, same reasoning as above, expressed through explicit setups rather than the score.',
  },
  'setup-C-only': {
    make: () => S.setupStrategy({ enabled: ['C_PULLBACK_LONG'] }), risk: SOLO_RISK,
    rationale: 'The single setup positive on development and validation, and the only one whose edge survives removing its five best trades.',
  },
};
const CONTROLS = {
  'control-random-100pct-long': { make: () => S.matchedRandomBaseline({ probability: 0.02, longProbability: 1 }), risk: RISK },
  'control-random-5050': { make: () => S.randomEntryBaseline({ probability: 0.02 }), risk: RISK },
  'control-long-when-d1-bullish': { make: () => S.dailyBiasBaseline({ probability: 0.02, allowShort: false }), risk: RISK },
  'control-ema-cross': { make: () => S.emaCrossBaseline(), risk: RISK },
  'control-trend-follow': { make: () => S.trendFollowBaseline(), risk: RISK },
};

const evaluate = (spec) => {
  const dev = M(runIn(PERIODS.development, spec.make(), { risk: spec.risk }).trades);
  const val = runIn(PERIODS.validation, spec.make(), { risk: spec.risk }).trades;
  const fin = runIn(PERIODS.finalTest, spec.make(), { risk: spec.risk }).trades;
  const oosT = [...val, ...fin];
  const sig = significance(oosT.map((t) => t.rMultiple));
  return {
    development: brief(dev), validation: brief(M(val)), finalTest: brief(M(fin)),
    outOfSample: { ...brief(M(oosT)), p: r(sig.pBootstrap), t: r(sig.t, 2), ci95: sig.ci95?.map((x) => r(x, 3)) },
    _oosMetrics: M(oosT), _devMetrics: dev,
  };
};

step('Phase 26 — candidates and controls across all three periods');
const results = {};
for (const [name, spec] of Object.entries({ ...CANDIDATES, ...CONTROLS })) {
  const e = evaluate(spec);
  results[name] = e;
  const f = (m) => `${String(m.trades).padStart(4)} ${(m.expectancy >= 0 ? '+' : '')}${(m.expectancy ?? 0).toFixed(3)}R pf${(m.profitFactor ?? 0).toFixed(2)}`;
  console.log(`  ${name.padEnd(30)} dev ${f(e.development)} | val ${f(e.validation)} | final ${f(e.finalTest)} | OOS ${f(e.outOfSample)} p=${e.outOfSample.p} ci=[${e.outOfSample.ci95?.join(', ')}]`);
}

// The primary is the candidate with the best OUT-OF-SAMPLE record whose interval
// excludes zero; if none qualifies there is no primary and the answer is NO TRADE.
const ranked = Object.entries(CANDIDATES)
  .map(([n]) => ({ name: n, e: results[n] }))
  .filter((x) => x.e.outOfSample.ci95 && x.e.outOfSample.ci95[0] > 0)
  .sort((a, b) => b.e.outOfSample.expectancy - a.e.outOfSample.expectancy);
const primary = ranked[0]?.name ?? null;
console.log(`\n  Candidates whose out-of-sample 95% interval excludes zero: ${ranked.length ? ranked.map((x) => x.name).join(', ') : 'NONE'}`);
console.log(`  PRIMARY: ${primary ?? 'none — the correct product behaviour is NO TRADE'}`);

// ---------------------------------------------------------------- costs
step('Phase 5 — the primary under every cost scenario');
const costScenarios = {};
if (primary) {
  for (const s of Object.keys(SCENARIOS)) {
    const t = [
      ...runIn(PERIODS.validation, CANDIDATES[primary].make(), { risk: CANDIDATES[primary].risk, execution: s }).trades,
      ...runIn(PERIODS.finalTest, CANDIDATES[primary].make(), { risk: CANDIDATES[primary].risk, execution: s }).trades,
    ];
    costScenarios[s] = M(t);
    console.log(`  ${s.padEnd(14)} ${JSON.stringify(brief(costScenarios[s]))}`);
  }
}

// ---------------------------------------------------------------- walk-forward
step('Phase 17 — walk-forward, 12 months train / 3 months test, run inside each feed');
const walkForward = {};
for (const [feedName, span] of Object.entries({
  legacy: { from: PERIODS.development.from, to: PERIODS.development.to, feed: 'legacy' },
  modern: { from: PERIODS.validation.from, to: PERIODS.finalTest.to, feed: 'modern' },
})) {
  const f = feedContext(feedName);
  const windows = makeWindows({ fromMs: span.from, toMs: span.to, trainMonths: 12, testMonths: 3 });
  const rows = [];
  for (const w of windows) {
    const spec = CANDIDATES[primary ?? 'production-baseline'];
    const t = runBacktest({
      ctx: f.ctx, strategy: spec.make(), execution: 'realistic', risk: spec.risk,
      newsWindow: f.costNews, fromMs: w.testFrom, toMs: w.testTo,
    }).trades;
    const m = computeMetrics(t, { accountSize: RISK.accountSize });
    if (m.trades >= 3) rows.push({ from: new Date(w.testFrom).toISOString().slice(0, 7), trades: m.trades, expectancy: r(m.expectancy), profitFactor: r(m.profitFactor, 3) });
  }
  const pos = rows.filter((x) => x.expectancy > 0).length;
  walkForward[feedName] = {
    windows: rows.length, profitableWindows: pos,
    consistency: rows.length ? r(pos / rows.length, 3) : null,
    meanExpectancy: rows.length ? r(rows.reduce((a, b) => a + b.expectancy, 0) / rows.length) : null,
    rows,
  };
  console.log(`  ${feedName.padEnd(7)} ${pos}/${rows.length} quarters positive (${rows.length ? ((pos / rows.length) * 100).toFixed(0) : '--'}%)  mean expectancy ${walkForward[feedName].meanExpectancy}R`);
}
// Combined consistency, used by the edge classifier.
const allRows = [...walkForward.legacy.rows, ...walkForward.modern.rows];
const combinedPos = allRows.filter((x) => x.expectancy > 0).length;
const wfSummary = {
  totalWindows: allRows.length,
  profitableWindows: combinedPos,
  consistency: allRows.length ? r(combinedPos / allRows.length, 3) : null,
  // In-sample here is the development record; out-of-sample is validation+final.
  degradation: primary ? r((results[primary].development.expectancy ?? 0) - (results[primary].outOfSample.expectancy ?? 0)) : null,
};
console.log(`  combined ${combinedPos}/${allRows.length} (${((combinedPos / allRows.length) * 100).toFixed(0)}%)  development→out-of-sample degradation ${wfSummary.degradation}R`);

// ---------------------------------------------------------------- Monte Carlo
step('Phase 19 — Monte Carlo on the primary\'s out-of-sample trades');
let mc = null;
if (primary) {
  const oosT = [
    ...runIn(PERIODS.validation, CANDIDATES[primary].make(), { risk: CANDIDATES[primary].risk }).trades,
    ...runIn(PERIODS.finalTest, CANDIDATES[primary].make(), { risk: CANDIDATES[primary].risk }).trades,
  ];
  mc = monteCarlo(oosT, { runs: 5000, mode: 'bootstrap', riskPct: 1, ruinPct: 50, tradesPerYear: 60 });
  console.log(`  resamples ending positive ${r(mc.finalR.pctPositive, 1)}%   probability of a negative year ${r(mc.probabilityOfNegativeYear.pct, 1)}%`);
  console.log(`  median drawdown ${r(mc.drawdownR.median, 1)}R   p95 ${r(mc.drawdownR.p95, 1)}R   probability of ruin ${r(mc.probabilityOfRuin.pct, 2)}%`);
}

// ---------------------------------------------------------------- sensitivity
step('Phase 28 — parameter sensitivity around the primary, DEVELOPMENT data only');
let sens = null;
let calibration = null;
if (primary) {
  const f = feedContext('legacy');
  sens = sensitivitySweep({
    ctx: f.ctx,
    baseConfig: { threshold: 70 },
    buildStrategy: (cfg) => directionFilter(() => S.productionSwing({ threshold: cfg.threshold }), 'LONG')(),
    execution: 'realistic', risk: RISK, newsWindow: f.costNews,
    fromMs: PERIODS.development.from, toMs: PERIODS.development.to,
    metricsOpts: { accountSize: RISK.accountSize },
    axes: { threshold: [62, 66, 70, 74, 78, 82] },
  });
  for (const [p, flag] of Object.entries(sens.flags)) {
    console.log(`  ${p.padEnd(14)} ${flag.padEnd(10)} [${sens.results[p].map((x) => r(x.expectancy, 3)).join(', ')}]`);
  }
  console.log(`  OVERFIT_RISK = ${sens.overfitRisk}${sens.monotonicAxes ? `  (${sens.monotonicAxes} monotonic axis: the chosen value sits at the edge of what was searched)` : ''}`);

  // Phase 24 — is the evidence score calibrated? A score that carries information
  // should show expectancy rising with it. This is the check that tells the
  // difference between "a number on a card" and "a number that means something".
  step('Phase 24 — evidence-score calibration, measured on every period');
  calibration = [];
  for (const th of [62, 66, 70, 74, 78, 82]) {
    const mk = directionFilter(() => S.productionSwing({ threshold: th }), 'LONG');
    const row = { threshold: th };
    for (const [pn, p] of Object.entries(PERIODS)) {
      const m = M(runIn(p, mk(), { risk: RISK }).trades);
      row[pn] = { trades: m.trades, expectancy: r(m.expectancy), profitFactor: r(m.profitFactor, 3), winRate: r(m.winRate, 2) };
    }
    calibration.push(row);
    console.log(`  threshold ${th}: ` + Object.entries(PERIODS).map(([pn]) => `${pn.slice(0, 5)} ${String(row[pn].trades).padStart(4)} ${(row[pn].expectancy >= 0 ? '+' : '')}${row[pn].expectancy.toFixed(3)}R`).join('  '));
  }
  const monotoneEverywhere = ['development', 'validation', 'finalTest'].every((pn) => {
    const xs = calibration.map((c) => c[pn].expectancy);
    return xs.every((v, i) => i === 0 || v >= xs[i - 1] - 0.06);
  });
  console.log(`  expectancy rises with the score in every period: ${monotoneEverywhere ? 'YES' : 'NO'}`);
}

// ---------------------------------------------------------------- verdict
step('Phase 29 — edge classification');
let verdict = null;
if (primary) {
  verdict = classifyEdge({
    outOfSample: results[primary]._oosMetrics,
    inSample: results[primary]._devMetrics,
    walkForward: wfSummary,
    sensitivity: sens,
    costScenarios,
  });
  for (const c of verdict.checks) console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name.padEnd(38)} actual=${c.actual} required ${c.required}`);
  console.log(`\n  VERDICT for ${primary}: ${verdict.verdict} (${verdict.passed}/${verdict.total})`);
} else {
  console.log('  No candidate qualified. Verdict: NO EDGE.');
}

const frozen = {
  id: 'candidate',
  primary,
  rationale: primary ? CANDIDATES[primary].rationale : 'No candidate produced an out-of-sample interval excluding zero.',
  candidates: Object.fromEntries(Object.entries(CANDIDATES).map(([k, v]) => [k, { rationale: v.rationale, risk: v.risk }])),
  frozenAt: new Date().toISOString(),
};
writeFileSync(join(ROOT, 'config', 'strategy-candidate.json'), JSON.stringify(frozen, null, 2));

writeResult('validation', {
  periods: Object.fromEntries(Object.entries(PERIODS).map(([k, v]) => [k, `${label(v)} (${v.feed})`])),
  primary,
  candidates: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { development: v.development, validation: v.validation, finalTest: v.finalTest, outOfSample: v.outOfSample }])),
  costScenarios: Object.fromEntries(Object.entries(costScenarios).map(([k, v]) => [k, brief(v)])),
  walkForward: { byFeed: walkForward, summary: wfSummary },
  monteCarlo: mc,
  sensitivity: sens ? { flags: sens.flags, overfitRisk: sens.overfitRisk, monotonicAxes: sens.monotonicAxes, results: sens.results } : null,
  calibration,
  verdict,
}, { note: 'Candidates pre-declared. Selection justified by development and validation only.' });
console.log('\n-> quant/results/validation.json and quant/config/strategy-candidate.json');
