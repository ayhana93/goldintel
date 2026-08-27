#!/usr/bin/env node
// Phase 36 — setup and regime decomposition.
//
//   node quant/scripts/run-decompose.mjs
//
// The aggregate strategy has no edge. The question this answers is whether any
// SMALL number of conditions inside it does. Two rules govern the whole script:
//
//   1. Selection happens on DEVELOPMENT data. Validation and the final test are
//      only ever used to check something already chosen.
//   2. Every condition examined is counted as a hypothesis. A cell that looks
//      significant is compared against how many significant cells pure noise
//      would have produced across the same screen.
//
// The goal is a handful of robust conditions, not a decision tree that explains
// history perfectly.

import { runIn, outOfSample, M, brief, RISK, SOLO_RISK, PERIODS, feedContext } from '../src/research.js';
import { setupStrategy } from '../src/backtest/strategies.js';
import { SETUP_IDS } from '../src/core/setups.js';
import { groupMetrics, significance, maeMfeStudy } from '../src/backtest/metrics.js';
import { screenSummary, bonferroni } from '../src/backtest/multipletesting.js';
import { makeWindows } from '../src/backtest/walkforward.js';
import { label } from '../src/periods.js';
import { writeResult } from '../src/report/io.js';

const step = (m) => process.stdout.write(`\n=== ${m}\n`);
const r = (x, d = 4) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const solo = (id) => setupStrategy({ enabled: [id] });

// ---------------------------------------------------------------- 1. per setup, per period
step('Phase 36.1 — every setup, every period, measured in isolation');
console.log('  setup                 development        validation         final test         pooled OOS');
const perSetup = {};
for (const id of SETUP_IDS) {
  const dev = M(runIn(PERIODS.development, solo(id), { risk: SOLO_RISK }).trades);
  const val = M(runIn(PERIODS.validation, solo(id), { risk: SOLO_RISK }).trades);
  const fin = M(runIn(PERIODS.finalTest, solo(id), { risk: SOLO_RISK }).trades);
  const oos = outOfSample(() => solo(id), { risk: SOLO_RISK });
  perSetup[id] = {
    development: brief(dev), validation: brief(val), finalTest: brief(fin),
    outOfSample: { ...brief(oos.metrics), p: r(oos.significance.pBootstrap), t: r(oos.significance.t, 2), ci95: oos.significance.ci95?.map((x) => r(x, 3)) },
    positiveInAllPeriods: dev.expectancy > 0 && val.expectancy > 0 && fin.expectancy > 0,
  };
  const c = (m) => `${String(m.trades).padStart(4)} ${(m.expectancy >= 0 ? '+' : '')}${(m.expectancy ?? 0).toFixed(3)}R`;
  console.log(`  ${id.padEnd(20)} ${c(dev).padEnd(18)} ${c(val).padEnd(18)} ${c(fin).padEnd(18)} ${c(oos.metrics)} p=${r(oos.significance.pBootstrap, 3)}`);
}

// ---------------------------------------------------------------- 2. per walk-forward window
step('Phase 36.2 — per setup, per walk-forward window (how much of it is a few trades?)');
const windows = makeWindows({ fromMs: PERIODS.development.from, toMs: PERIODS.development.to, trainMonths: 12, testMonths: 3 });
const windowStats = {};
for (const id of SETUP_IDS) {
  const rows = windows.map((w) => {
    const m = M(runIn({ from: w.testFrom, to: w.testTo, feed: PERIODS.development.feed }, solo(id), { risk: SOLO_RISK }).trades);
    return { from: new Date(w.testFrom).toISOString().slice(0, 7), trades: m.trades, expectancy: r(m.expectancy) };
  }).filter((x) => x.trades >= 3);
  const positive = rows.filter((x) => x.expectancy > 0).length;
  windowStats[id] = { windows: rows.length, positiveWindows: positive, consistency: rows.length ? r(positive / rows.length, 3) : null, rows };
  console.log(`  ${id.padEnd(20)} ${positive}/${rows.length} quarters positive (${rows.length ? ((positive / rows.length) * 100).toFixed(0) : '--'}%)`);
}

// ---------------------------------------------------------------- 3. concentration
step('Phase 36.3 — is the result driven by a handful of trades?');
const concentration = {};
for (const id of SETUP_IDS) {
  const t = [...runIn(PERIODS.development, solo(id), { risk: SOLO_RISK }).trades];
  if (t.length < 10) { concentration[id] = null; continue; }
  const rs = t.map((x) => x.rMultiple).sort((a, b) => b - a);
  const total = rs.reduce((a, b) => a + b, 0);
  const top5 = rs.slice(0, 5).reduce((a, b) => a + b, 0);
  const top10pct = rs.slice(0, Math.max(1, Math.round(rs.length * 0.1))).reduce((a, b) => a + b, 0);
  // Expectancy with the five best trades removed: does the edge survive?
  const exTop5 = rs.slice(5).reduce((a, b) => a + b, 0) / Math.max(1, rs.length - 5);
  concentration[id] = {
    trades: rs.length, netR: r(total, 2),
    top5R: r(top5, 2), top10pctR: r(top10pct, 2),
    expectancyExcludingTop5: r(exTop5),
    survivesRemovingTop5: exTop5 > 0,
  };
  console.log(`  ${id.padEnd(20)} netR=${String(r(total, 1)).padStart(7)}  top-5 trades=${String(r(top5, 1)).padStart(6)}R  expectancy without them=${(exTop5 >= 0 ? '+' : '')}${exTop5.toFixed(3)}R ${exTop5 > 0 ? '' : '  <-- edge disappears'}`);
}

// ---------------------------------------------------------------- 4. conditional screen
step('Phase 36.4 — conditional screen, DEVELOPMENT only, with every hypothesis counted');
// A deliberately SMALL, pre-declared set of conditions. Testing every possible
// combination would guarantee a beautiful cell and mean nothing.
const CONDITIONS = {
  d1Trend: (t) => t.meta.regime.startsWith('TRENDING') ? t.meta.regime : t.meta.regime.startsWith('PULLBACK') ? 'PULLBACK' : 'OTHER',
  volState: (t) => t.meta.volState,
  session: (t) => t.meta.session,
  newsProximity: (t) => (t.meta.inNews ? 'IN_NEWS' : 'OUTSIDE'),
  evidenceBucket: (t) => {
    const e = t.direction === 'LONG' ? t.meta.evidenceLong : t.meta.evidenceShort;
    if (e == null) return null;
    return e >= 75 ? 'ev>=75' : e >= 65 ? 'ev65-75' : e >= 55 ? 'ev55-65' : 'ev<55';
  },
};
const cells = [];
const conditional = {};
for (const id of SETUP_IDS) {
  const trades = runIn(PERIODS.development, solo(id), { risk: SOLO_RISK }).trades;
  conditional[id] = {};
  for (const [cname, fn] of Object.entries(CONDITIONS)) {
    const g = groupMetrics(trades, fn, { accountSize: RISK.accountSize });
    conditional[id][cname] = {};
    for (const [bucket, m] of Object.entries(g)) {
      if (m.trades < 30) continue;             // too small to be a hypothesis worth testing
      const sig = m.significance ?? {};
      conditional[id][cname][bucket] = { ...brief(m) };
      cells.push({ key: `${id}|${cname}=${bucket}`, p: sig.pBootstrap, expectancy: m.expectancy, trades: m.trades });
    }
  }
}
const screen = screenSummary(cells, 0.05);
console.log(`  cells examined (n>=30):        ${screen.hypotheses}`);
console.log(`  nominally significant at 0.05: ${screen.nominalDiscoveries}`);
console.log(`  expected by chance alone:      ${screen.expectedByChance}`);
console.log(`  excess over chance:            ${screen.excessOverChance}`);
console.log(`  Bonferroni threshold:          p < ${screen.bonferroniThreshold}`);
console.log(`  surviving FDR control:         ${screen.survivingFDR.length === 0 ? 'NONE' : screen.survivingFDR.map((s) => `${s.key} (q=${s.q})`).join(', ')}`);
const best = cells.filter((c) => c.p != null).sort((a, b) => a.p - b.p).slice(0, 8);
console.log('\n  best cells by nominal p (all on development data):');
for (const c of best) {
  console.log(`    ${c.key.padEnd(46)} n=${String(c.trades).padStart(4)} exp=${(c.expectancy >= 0 ? '+' : '')}${c.expectancy.toFixed(3)}R  p=${r(c.p, 4)}  Bonferroni-adjusted p=${r(bonferroni(c.p, screen.hypotheses), 3)}`);
}

// ---------------------------------------------------------------- 5. promising setups
step('Phase 36.5 — promising setups: positive in BOTH development and validation');
const promising = SETUP_IDS.filter((id) => perSetup[id].development.expectancy > 0 && perSetup[id].validation.expectancy > 0);
console.log(`  candidates: ${promising.length ? promising.join(', ') : 'NONE'}`);
const promisingReport = {};
for (const id of promising) {
  const s = perSetup[id];
  const ci = s.outOfSample.ci95;
  const answers = {
    'positive on the untouched final test': s.finalTest.expectancy > 0,
    'positive after realistic costs': s.outOfSample.expectancy > 0,
    'confidence interval compatible with a positive edge': ci ? ci[0] > 0 : false,
    'survives most walk-forward windows': (windowStats[id].consistency ?? 0) >= 0.5,
    'edge survives removing its five best trades': concentration[id]?.survivesRemovingTop5 === true,
    'out-of-sample sample size at least 100': s.outOfSample.trades >= 100,
  };
  promisingReport[id] = { stats: s, answers, passed: Object.values(answers).filter(Boolean).length, total: Object.keys(answers).length };
  console.log(`\n  ${id}`);
  for (const [q, a] of Object.entries(answers)) console.log(`    [${a ? 'YES' : 'NO '}] ${q}`);
  console.log(`    -> ${promisingReport[id].passed}/${promisingReport[id].total}`);
}

// ---------------------------------------------------------------- 6. quarantine
step('Phase 36.6 — setups to quarantine (sufficient OOS sample, negative expectancy, PF below 1)');
const quarantine = {};
for (const id of SETUP_IDS) {
  const o = perSetup[id].outOfSample;
  const negative = o.trades >= 50 && o.expectancy < 0 && o.profitFactor != null && o.profitFactor < 1;
  const ciNegative = o.ci95 ? o.ci95[1] < 0 : false;
  quarantine[id] = {
    state: negative ? 'DISABLED_NEGATIVE_EDGE' : 'ACTIVE',
    reason: negative
      ? `${o.trades} out-of-sample trades, expectancy ${o.expectancy}R, profit factor ${o.profitFactor}${ciNegative ? ', and the whole 95% interval is below zero' : ''}.`
      : null,
    confidenceIntervalEntirelyNegative: ciNegative,
  };
  if (negative) console.log(`  ${id.padEnd(20)} DISABLED_NEGATIVE_EDGE — ${quarantine[id].reason}`);
}
if (!Object.values(quarantine).some((q) => q.state === 'DISABLED_NEGATIVE_EDGE')) console.log('  none');

// ---------------------------------------------------------------- 7. MAE/MFE per promising setup
step('Phase 36.7 — MAE / MFE for the promising setups (development)');
const maeMfe = {};
for (const id of promising.length ? promising : SETUP_IDS.slice(0, 3)) {
  const t = runIn(PERIODS.development, solo(id), { risk: SOLO_RISK }).trades;
  maeMfe[id] = maeMfeStudy(t);
  console.log(`  ${id}: MFE reach ${maeMfe[id].mfeReach.map((x) => `${x.r}R:${(x.pct ?? 0).toFixed(0)}%`).join(' ')}`);
}

writeResult('decomposition', {
  periods: Object.fromEntries(Object.entries(PERIODS).map(([k, v]) => [k, `${label(v)} (${v.feed})`])),
  perSetup, windowStats, concentration,
  conditionalScreen: { conditions: Object.keys(CONDITIONS), screen, cells: cells.map((c) => ({ ...c, p: r(c.p), expectancy: r(c.expectancy) })), bySetup: conditional },
  promising: promisingReport, quarantine, maeMfe,
}, { note: 'Selection used DEVELOPMENT data only. Validation and final test are checks.' });
console.log('\n-> quant/results/decomposition.json');
