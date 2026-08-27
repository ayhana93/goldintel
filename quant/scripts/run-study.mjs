#!/usr/bin/env node
// Phases 8, 13-16, 21, 26 on the modern split.
//
//   node quant/scripts/run-study.mjs
//
// The studies that are not covered by run-decompose.mjs (per-setup) or
// run-targets.mjs (stops and targets): the news filter, session and calendar
// effects, feature correlation and double counting, component ablation, and the
// scalp tier's cost problem.

import { runIn, M, brief, RISK, PERIODS, feedContext } from '../src/research.js';
import * as S from '../src/backtest/strategies.js';
import { runBacktest } from '../src/backtest/engine.js';
import { groupMetrics, maeMfeStudy } from '../src/backtest/metrics.js';
import { featureCorrelation } from '../src/backtest/correlation.js';
import { SCENARIOS } from '../src/core/execution.js';
import { label } from '../src/periods.js';
import { writeResult, slimTrades } from '../src/report/io.js';

const step = (m) => process.stdout.write(`\n=== ${m}\n`);
const r = (x, d = 4) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const longOnly = (cfg = {}) => () => { const b = S.productionSwing(cfg); return (a) => b(a).filter((s) => s.direction === 'LONG'); };

// ---------------------------------------------------------------- scalp costs
step('Phase 16 — the scalp tier under every cost scenario, every period');
const scalp = {};
for (const [pn, p] of Object.entries(PERIODS)) {
  scalp[pn] = {};
  for (const s of Object.keys(SCENARIOS)) {
    scalp[pn][s] = brief(M(runIn(p, S.productionScalp(), { execution: s }).trades));
  }
  console.log(`  ${pn.padEnd(12)} ` + Object.entries(scalp[pn]).map(([k, m]) => `${k.slice(0, 4)} ${(m.expectancy >= 0 ? '+' : '')}${m.expectancy.toFixed(3)}R`).join('  '));
}
console.log('  The signal is marginally positive frictionless and catastrophic after costs:');
console.log('  a 0.8 ATR(M15) stop on gold is $1.20-$3.20, against a round trip of about $0.50.');

// ---------------------------------------------------------------- news filter
step('Phase 13 — news filter modes, development period');
const f = feedContext(PERIODS.development.feed);
const highImpact = f.highImpact;
const newsModes = {};
const modeDefs = {
  'A: trade normally': {},
  'B: block 15m before': { newsFilter: { contains: (t) => highImpact.some((e) => t >= e.time - 15 * 60000 && t <= e.time) } },
  'C: block 30m before': { newsFilter: { contains: (t) => highImpact.some((e) => t >= e.time - 30 * 60000 && t <= e.time) } },
  'D: block 15m either side': { newsFilter: { contains: (t) => highImpact.some((e) => Math.abs(t - e.time) <= 15 * 60000) } },
  'E: block if a release is < 4h away': { newsBlockAheadHours: 4, newsEvents: highImpact },
  'F: block if a release is < 24h away': { newsBlockAheadHours: 24, newsEvents: highImpact },
};
for (const [name, extra] of Object.entries(modeDefs)) {
  const m = M(runBacktest({
    ctx: f.ctx, strategy: S.setupStrategy(extra), execution: 'realistic', risk: RISK,
    newsWindow: f.costNews, fromMs: PERIODS.development.from, toMs: PERIODS.development.to,
  }).trades);
  newsModes[name] = brief(m);
  console.log(`  ${name.padEnd(36)} ${JSON.stringify(newsModes[name])}`);
}

// ---------------------------------------------------------------- conditional
step('Phases 14-15 — session, hour, day of week, direction (primary configuration)');
const conditional = {};
for (const [pn, p] of Object.entries(PERIODS)) {
  const t = runIn(p, longOnly()(), { risk: RISK }).trades;
  const g = (fn) => groupMetrics(t, fn, { accountSize: RISK.accountSize });
  conditional[pn] = {
    bySession: g((x) => x.meta.session),
    byHour: g((x) => String(x.meta.hour).padStart(2, '0')),
    byDayOfWeek: g((x) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][x.meta.dayOfWeek]),
    byRegime: g((x) => x.meta.regime),
    byVolState: g((x) => x.meta.volState),
    byNews: g((x) => (x.meta.inNews ? 'IN_NEWS_WINDOW' : 'OUTSIDE')),
  };
}
for (const pn of Object.keys(PERIODS)) {
  const rows = Object.entries(conditional[pn].bySession).filter(([, m]) => m.trades >= 15)
    .sort((a, b) => b[1].expectancy - a[1].expectancy);
  console.log(`  ${pn.padEnd(12)} sessions: ` + rows.map(([k, m]) => `${k} ${(m.expectancy >= 0 ? '+' : '')}${m.expectancy.toFixed(3)}(${m.trades})`).join(' '));
}
console.log('  Session rankings do not repeat across periods, which is what noise looks like.');
console.log('  No session is disabled on this evidence.');

// ---------------------------------------------------------------- both directions
step('Phase 15 — long versus short, every period');
const longShort = {};
for (const [pn, p] of Object.entries(PERIODS)) {
  const t = runIn(p, S.productionSwing(), { risk: RISK }).trades;
  longShort[pn] = groupMetrics(t, (x) => x.direction, { accountSize: RISK.accountSize });
  console.log(`  ${pn.padEnd(12)} ` + ['LONG', 'SHORT'].map((d) => {
    const m = longShort[pn][d];
    return m ? `${d} n=${String(m.trades).padStart(4)} ${(m.expectancy >= 0 ? '+' : '')}${m.expectancy.toFixed(3)}R pf${(m.profitFactor ?? 0).toFixed(2)}` : `${d} none`;
  }).join('   '));
}

// ---------------------------------------------------------------- correlation
step('Phase 21 — feature correlation and double counting (development)');
const corr = featureCorrelation({ ctx: f.ctx, fromMs: PERIODS.development.from, toMs: PERIODS.development.to, stride: 6, horizonBars: 24 });
console.log(`  samples ${corr.samples}`);
console.log('  redundant pairs (|r| >= 0.6):', corr.redundantPairs.length ? corr.redundantPairs.map((p) => `${p.a}<->${p.b} r=${p.r}`).join(', ') : 'none');
console.log('  correlation with the forward 24h return:', JSON.stringify(corr.predictiveVsForwardReturn));

// ---------------------------------------------------------------- ablation
step('Phase 8 — component ablation on the primary configuration');
const BASE_W = { trend: 25, structure: 25, momentum: 12, support_resistance: 13, price_action: 10, macro: 15 };
const ablation = {};
const full = M(runIn(PERIODS.development, longOnly({ weights: BASE_W })(), { risk: RISK }).trades);
ablation['(none removed)'] = brief(full);
console.log(`  ${'(none removed)'.padEnd(24)} ${JSON.stringify(ablation['(none removed)'])}`);
for (const drop of Object.keys(BASE_W)) {
  const rest = Object.fromEntries(Object.entries(BASE_W).filter(([k]) => k !== drop));
  const total = Object.values(rest).reduce((a, b) => a + b, 0);
  const w = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, (v / total) * 100]));
  w[drop] = 0;
  const m = M(runIn(PERIODS.development, longOnly({ weights: w })(), { risk: RISK }).trades);
  ablation[`without ${drop}`] = brief(m);
  const delta = (m.expectancy ?? 0) - (full.expectancy ?? 0);
  console.log(`  ${('without ' + drop).padEnd(24)} ${JSON.stringify(ablation[`without ${drop}`])} delta=${delta >= 0 ? '+' : ''}${r(delta)}`);
}

// ---------------------------------------------------------------- MAE/MFE
step('Phase 10 — MAE / MFE for the primary configuration');
const maeMfe = {};
for (const [pn, p] of Object.entries(PERIODS)) {
  maeMfe[pn] = maeMfeStudy(runIn(p, longOnly()(), { risk: RISK }).trades);
  console.log(`  ${pn.padEnd(12)} MFE reach ${maeMfe[pn].mfeReach.map((x) => `${x.r}R:${(x.pct ?? 0).toFixed(0)}%`).join(' ')}`);
}

writeResult('study', {
  periods: Object.fromEntries(Object.entries(PERIODS).map(([k, v]) => [k, `${label(v)} (${v.feed})`])),
  scalpByCost: scalp, newsModes, conditional, longShort, correlation: corr, ablation, maeMfe,
}, { note: 'Development-period studies plus per-period conditional breakdowns.' });

const devTrades = runIn(PERIODS.development, longOnly()(), { risk: RISK }).trades;
writeResult('trades-development', { trades: slimTrades(devTrades) }, { strategy: 'baseline-long-only', period: label(PERIODS.development) });
console.log('\n-> quant/results/study.json');
