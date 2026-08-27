#!/usr/bin/env node
// The research pipeline. Runs every study on the DEVELOPMENT and VALIDATION
// periods only; the final test period is opened by run-final.mjs, once.
//
//   node quant/scripts/run-study.mjs

import { join } from 'node:path';
import { loadGoldDataset } from '../src/data/dataset.js';
import { buildContext } from '../src/core/context.js';
import { buildCalendar, makeNewsWindow } from '../src/core/calendar.js';
import { runBacktest } from '../src/backtest/engine.js';
import { computeMetrics, groupMetrics, maeMfeStudy } from '../src/backtest/metrics.js';
import { featureCorrelation } from '../src/backtest/correlation.js';
import {
  productionSwing, productionScalp, setupStrategy,
  emaCrossBaseline, trendFollowBaseline, randomEntryBaseline,
} from '../src/backtest/strategies.js';
import { SETUP_IDS } from '../src/core/setups.js';
import { SCENARIOS } from '../src/core/execution.js';
import { PERIODS, OPEN_PERIOD, label } from '../src/periods.js';
import { writeResult, slimTrades, ROOT } from '../src/report/io.js';

const DIR = join(ROOT, 'data', 'normalized');
const RISK = { accountSize: 10000, riskPerTradePct: 1, maxConcurrentTrades: 2, maxDailyLossPct: 3, maxWeeklyLossPct: 6 };
const step = (m) => { process.stdout.write(`\n=== ${m}\n`); };
const t0 = Date.now();

step('loading dataset');
const ds = loadGoldDataset(DIR);
const ctx = buildContext({ m15: ds.m15, h1: ds.h1, h4: ds.h4, d1: ds.d1, macro: { dxy: ds.dxy } });
const events = buildCalendar(ds.h1.candles[0].openTime, ds.h1.candles.at(-1).closeTime);
const newsWindows = {
  none: null,
  before15: makeNewsWindow(events, { beforeMin: 15, afterMin: 0 }),
  before30: makeNewsWindow(events, { beforeMin: 30, afterMin: 0 }),
  around15: makeNewsWindow(events, { beforeMin: 15, afterMin: 15 }),
};
// Cost modelling always knows about news; only the ENTRY FILTER is varied.
const costNews = makeNewsWindow(events, { beforeMin: 10, afterMin: 20 });

const bt = (strategy, period, opts = {}) => runBacktest({
  ctx, strategy, execution: opts.execution ?? 'realistic',
  risk: opts.risk ?? RISK, newsWindow: opts.newsWindow ?? costNews,
  fromMs: period.from, toMs: period.to, options: opts.options ?? {},
});
const M = (trades) => computeMetrics(trades, { accountSize: RISK.accountSize });
const brief = (m) => ({
  trades: m.trades, winRate: r2(m.winRate), expectancy: r4(m.expectancy),
  profitFactor: m.profitFactor === Infinity ? null : r3(m.profitFactor),
  netR: r1(m.netR), maxDrawdownR: r1(m.maxDrawdownR), maxDrawdownPct: r1(m.maxDrawdownPct),
  sharpe: r2(m.sharpe), avgHoldingHours: r1(m.avgHoldingHours),
});

// ---------------------------------------------------------------- 1. baseline
step('Phase 8 — baseline (production engine) across cost scenarios');
const baselineByCost = {};
for (const scenario of Object.keys(SCENARIOS)) {
  const res = bt(productionSwing(), OPEN_PERIOD, { execution: scenario });
  baselineByCost[scenario] = M(res.trades);
  console.log(`  swing/${scenario.padEnd(12)}`, JSON.stringify(brief(baselineByCost[scenario])));
}
const baselineScalpByCost = {};
for (const scenario of Object.keys(SCENARIOS)) {
  const res = bt(productionScalp(), OPEN_PERIOD, { execution: scenario });
  baselineScalpByCost[scenario] = M(res.trades);
  console.log(`  scalp/${scenario.padEnd(12)}`, JSON.stringify(brief(baselineScalpByCost[scenario])));
}

const baseDev = bt(productionSwing(), PERIODS.development);
const baseVal = bt(productionSwing(), PERIODS.validation);
console.log('  swing development ', JSON.stringify(brief(M(baseDev.trades))));
console.log('  swing validation  ', JSON.stringify(brief(M(baseVal.trades))));

// ---------------------------------------------------------------- 2. setups
step('Phase 6/9 — per-setup empirical statistics (development period)');
// Each setup is measured ALONE. Run together, maxConcurrentTrades decides which
// setup gets the slot, so a setup's statistics would depend on what its
// neighbours happened to be doing — an artefact, not a property of the setup.
const soloRuns = {};
for (const id of SETUP_IDS) {
  soloRuns[id] = bt(setupStrategy({ enabled: [id] }), PERIODS.development,
    { risk: { ...RISK, maxConcurrentTrades: 1 } });
}
const bySetup = Object.fromEntries(Object.entries(soloRuns).map(([id, r]) => [id, M(r.trades)]));
const allSetups = bt(setupStrategy(), PERIODS.development);
const setupRows = SETUP_IDS.map((id) => ({ id, ...(bySetup[id] ? brief(bySetup[id]) : { trades: 0 }) }));
for (const row of setupRows.sort((a, b) => (b.expectancy ?? -9) - (a.expectancy ?? -9))) {
  console.log(`  ${row.id.padEnd(20)} n=${String(row.trades).padStart(5)} wr=${String(row.winRate ?? '-').padStart(6)} exp=${String(row.expectancy ?? '-').padStart(8)} pf=${String(row.profitFactor ?? '-').padStart(6)}`);
}

// ---------------------------------------------------------------- 3. MAE/MFE
step('Phase 10 — MAE / MFE');
const soloTrades = Object.values(soloRuns).flatMap((r) => r.trades);
const maeMfe = {
  all: maeMfeStudy(soloTrades),
  baseline: maeMfeStudy(baseDev.trades),
  bySetup: Object.fromEntries(Object.entries(soloRuns).map(([id, r]) => [id, maeMfeStudy(r.trades)])),
};
console.log('  MFE reach (all setups, solo runs):', maeMfe.all.mfeReach.map((x) => `${x.r}R:${r1(x.pct)}%`).join(' '));
console.log('  winner MAE p75:', r2(maeMfe.all.winners.maeP75), 'R | loser MFE p75:', r2(maeMfe.all.losers.mfeP75), 'R');

// ---------------------------------------------------------------- 4. SL / TP
step('Phase 11/12 — stop and target policy grid (development period)');
const stopPolicies = ['atr', 'swing', 'structure_atr', 'volatility_adjusted'];
const targetGrids = {
  'R 1/2/3': { policy: 'fixedR', cfg: { rMultiples: [1, 2, 3] } },
  'R 1.5/2.5/4': { policy: 'fixedR', cfg: { rMultiples: [1.5, 2.5, 4] } },
  'R 2/3/5': { policy: 'fixedR', cfg: { rMultiples: [2, 3, 5] } },
  'R 0.75/1.5/2.5': { policy: 'fixedR', cfg: { rMultiples: [0.75, 1.5, 2.5] } },
  structure: { policy: 'structure', cfg: { rMultiples: [1, 2, 3], minTargetR: 0.8 } },
  production: { policy: 'production', cfg: {} },
};
const levelGrid = [];
for (const sp of stopPolicies) {
  for (const [tname, t] of Object.entries(targetGrids)) {
    const res = bt(setupStrategy({ stopPolicy: sp, targetPolicy: t.policy, targetCfg: t.cfg }), PERIODS.development);
    const m = M(res.trades);
    levelGrid.push({ stopPolicy: sp, targetPolicy: tname, ...brief(m) });
  }
}
for (const row of [...levelGrid].sort((a, b) => (b.expectancy ?? -9) - (a.expectancy ?? -9)).slice(0, 8)) {
  console.log(`  ${row.stopPolicy.padEnd(20)} ${row.targetPolicy.padEnd(16)} n=${String(row.trades).padStart(5)} exp=${String(row.expectancy).padStart(8)} pf=${String(row.profitFactor).padStart(6)} dd=${String(row.maxDrawdownR).padStart(6)}`);
}

// ---------------------------------------------------------------- 5. conditional
step('Phase 9/14/15/16 — conditional performance (development period)');
const g = (fn) => groupMetrics(soloTrades, fn, { accountSize: RISK.accountSize });
const conditional = {
  byRegime: g((t) => t.meta.regime),
  bySession: g((t) => t.meta.session),
  byDirection: g((t) => t.direction),
  byVolState: g((t) => t.meta.volState),
  byNews: g((t) => (t.meta.inNews ? 'IN_NEWS_WINDOW' : 'OUTSIDE')),
  byHour: g((t) => String(t.meta.hour).padStart(2, '0')),
  byDayOfWeek: g((t) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t.meta.dayOfWeek]),
  bySetupAndRegime: groupMetrics(soloTrades, (t) => `${t.setupId}|${t.meta.regime}`, { accountSize: RISK.accountSize }),
};
const show = (title, obj) => {
  console.log(`  ${title}`);
  for (const [k, m] of Object.entries(obj).sort((a, b) => (b[1].expectancy ?? -9) - (a[1].expectancy ?? -9))) {
    if (m.trades < 15) continue;
    console.log(`    ${k.padEnd(20)} n=${String(m.trades).padStart(5)} wr=${String(r2(m.winRate)).padStart(6)} exp=${String(r4(m.expectancy)).padStart(9)} pf=${String(r3(m.profitFactor)).padStart(6)}`);
  }
};
show('by regime', conditional.byRegime);
show('by session', conditional.bySession);
show('by direction', conditional.byDirection);
show('long vs short', conditional.byDirection);

// ---------------------------------------------------------------- 6. news filter
step('Phase 13 — news filter modes (development period)');
// The cost model always widens spreads around a release; only the ENTRY FILTER
// varies. Modes E and F test the question that actually matters at H1 decision
// frequency: not "are we within 15 minutes of a release" (almost never, on an
// hourly grid) but "will this position still be open when one lands".
const highImpact = events.filter((e) => e.precision === 'exact' && e.importance === 'high');
const newsModeDefs = {
  'A: trade normally': {},
  'B: block 15m before': { newsFilter: newsWindows.before15 },
  'C: block 30m before': { newsFilter: newsWindows.before30 },
  'D: block 15m either side': { newsFilter: newsWindows.around15 },
  'E: block if release < 4h away': { newsBlockAheadHours: 4, newsEvents: highImpact },
  'F: block if release < 24h away': { newsBlockAheadHours: 24, newsEvents: highImpact },
};
const newsModes = {};
for (const [name, extra] of Object.entries(newsModeDefs)) {
  const res = runBacktest({
    ctx, strategy: setupStrategy(extra), execution: 'realistic', risk: RISK,
    newsWindow: costNews, fromMs: PERIODS.development.from, toMs: PERIODS.development.to,
  });
  newsModes[name] = M(res.trades);
  console.log(`  ${name.padEnd(32)}`, JSON.stringify(brief(newsModes[name])));
}

// ---------------------------------------------------------------- 7. scalp
step('Phase 16 — scalp tier under each cost scenario (development period)');
const scalpByCost = {};
for (const scenario of Object.keys(SCENARIOS)) {
  const res = bt(productionScalp(), PERIODS.development, { execution: scenario });
  scalpByCost[scenario] = M(res.trades);
  console.log(`  ${scenario.padEnd(14)}`, JSON.stringify(brief(scalpByCost[scenario])));
}

// ---------------------------------------------------------------- 8. controls
step('Phase 26 — control strategies (development period)');
const controls = {};
for (const [name, strat] of Object.entries({
  'GoldIntel baseline swing': productionSwing(),
  'GoldIntel all setups': setupStrategy(),
  'Control: EMA 20/50 cross': emaCrossBaseline(),
  'Control: trend follow': trendFollowBaseline(),
  'Control: random entry': randomEntryBaseline({ probability: 0.02 }),
})) {
  const res = bt(strat, PERIODS.development);
  controls[name] = M(res.trades);
  console.log(`  ${name.padEnd(28)}`, JSON.stringify(brief(controls[name])));
}

// ---------------------------------------------------------------- 8b. ablation
step('Phase 8/21 — component ablation: which parts of the score are load-bearing?');
// Remove one component and renormalize the rest back to 100, so the threshold of
// 70 keeps meaning "70% of available evidence" rather than silently becoming
// harder to reach. A component whose removal IMPROVES the result is not
// contributing evidence; it is contributing noise.
const BASE_W = { trend: 25, structure: 25, momentum: 12, support_resistance: 13, price_action: 10, macro: 15 };
const ablation = {};
const full = M(bt(productionSwing({ weights: BASE_W }), PERIODS.development).trades);
ablation['(none removed)'] = full;
console.log(`  ${'(none removed)'.padEnd(22)}`, JSON.stringify(brief(full)));
for (const drop of Object.keys(BASE_W)) {
  const rest = Object.fromEntries(Object.entries(BASE_W).filter(([k]) => k !== drop));
  const total = Object.values(rest).reduce((a, b) => a + b, 0);
  const w = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, (v / total) * 100]));
  w[drop] = 0;
  const m = M(bt(productionSwing({ weights: w }), PERIODS.development).trades);
  ablation[`without ${drop}`] = m;
  const delta = (m.expectancy ?? 0) - (full.expectancy ?? 0);
  console.log(`  ${('without ' + drop).padEnd(22)}`, JSON.stringify(brief(m)), ` delta=${delta >= 0 ? '+' : ''}${r4(delta)}`);
}

step('Phase 8 — does a simpler rule do better? (development period)');
const simpler = {};
for (const [name, strat] of Object.entries({
  'score only, no setups': productionSwing(),
  'score, ATR stop + 1/2/3R': productionSwing({ stopPolicy: 'atr', targetPolicy: 'fixedR', minRR: 0, targetCfg: { rMultiples: [1, 2, 3] }, stopCfg: { atrMult: 1.5 } }),
  'score threshold 80': productionSwing({ threshold: 80, stopPolicy: 'atr', targetPolicy: 'fixedR', minRR: 0, targetCfg: { rMultiples: [1, 2, 3] } }),
  'score threshold 60': productionSwing({ threshold: 60, stopPolicy: 'atr', targetPolicy: 'fixedR', minRR: 0, targetCfg: { rMultiples: [1, 2, 3] } }),
  'trend follow control': trendFollowBaseline(),
})) {
  simpler[name] = M(bt(strat, PERIODS.development).trades);
  console.log(`  ${name.padEnd(28)}`, JSON.stringify(brief(simpler[name])));
}

// ---------------------------------------------------------------- 9. correlation
step('Phase 21 — feature correlation');
const corr = featureCorrelation({ ctx, fromMs: PERIODS.development.from, toMs: PERIODS.development.to, stride: 6, horizonBars: 24 });
console.log('  samples', corr.samples);
console.log('  redundant pairs (|r| >= 0.6):');
for (const p of corr.redundantPairs) console.log(`    ${p.a} <-> ${p.b}  r=${p.r}`);
console.log('  correlation with forward 24h return:', JSON.stringify(corr.predictiveVsForwardReturn));

// ---------------------------------------------------------------- write
writeResult('study', {
  periods: { development: label(PERIODS.development), validation: label(PERIODS.validation), finalTest: label(PERIODS.finalTest) },
  baseline: { byCost: baselineByCost, scalpByCost: baselineScalpByCost, development: M(baseDev.trades), validation: M(baseVal.trades) },
  setups: { rows: setupRows, byRegime: conditional.bySetupAndRegime, note: 'Each setup measured in isolation with maxConcurrentTrades=1.' },
  maeMfe,
  levelGrid,
  conditional,
  newsModes,
  scalpByCost,
  controls,
  ablation,
  simpler,
  correlation: corr,
}, { period: 'development+validation', note: 'The final test period is not touched by this script.' });

writeResult('trades-development', { trades: slimTrades(soloTrades) },
  { strategy: 'each setup run in isolation, maxConcurrentTrades=1', period: label(PERIODS.development) });

console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s -> quant/results/study.json`);

function r1(x) { return x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10; }
function r2(x) { return x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100; }
function r3(x) { return x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000; }
function r4(x) { return x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000; }
