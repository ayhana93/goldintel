#!/usr/bin/env node
// Phases 10-12 — stop and target selection from the data.
//
//   node quant/scripts/run-targets.mjs
//
// The shipped engine picks the farthest structure level and floors TP3 at 5R,
// which maximises the number printed on the card rather than the money. This
// measures the empirical probability of reaching each candidate target BEFORE
// the stop, and then compares expected value.
//
// Selection uses DEVELOPMENT and VALIDATION. The final test is reported for the
// chosen configuration only, as a check.

import { runIn, M, brief, RISK, PERIODS } from '../src/research.js';
import * as S from '../src/backtest/strategies.js';
import { significance } from '../src/backtest/metrics.js';
import { writeResult } from '../src/report/io.js';

const step = (m) => process.stdout.write(`\n=== ${m}\n`);
const r = (x, d = 4) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

/** The primary configuration: the shipped score engine, long side only. */
const longOnly = (cfg = {}) => () => {
  const inner = S.productionSwing(cfg);
  return (args) => inner(args).filter((s) => s.direction === 'LONG');
};

// ---------------------------------------------------------------- 1. reachability
step('Phase 10 — how often does price reach each level before the stop?');
// Run once with far targets so nothing is closed early, then read MFE. MFE is the
// furthest the trade ran in favour, so P(MFE >= x) is exactly the probability of
// touching x R before being stopped out.
const probe = () => {
  const inner = S.productionSwing({ targetPolicy: 'fixedR', targetCfg: { rMultiples: [20, 30, 40] }, minRR: 0, rrLeg: 'rr1' });
  return (args) => inner(args).filter((s) => s.direction === 'LONG');
};
const reach = {};
for (const [pn, p] of Object.entries(PERIODS)) {
  const t = runIn(p, probe(), { risk: RISK }).trades;
  reach[pn] = { trades: t.length };
  for (const x of [0.5, 1, 1.5, 2, 2.5, 3, 4, 5]) {
    reach[pn][`${x}R`] = t.length ? r((t.filter((y) => y.mfe >= x).length / t.length) * 100, 1) : null;
  }
  console.log(`  ${pn.padEnd(12)} n=${String(t.length).padStart(4)} ` +
    [0.5, 1, 1.5, 2, 2.5, 3, 4, 5].map((x) => `${x}R:${String(reach[pn][`${x}R`]).padStart(5)}%`).join(' '));
}
console.log('\n  A target only pays if price gets there. Anything past 3R is reached by a');
console.log('  small minority of trades, which is why "maximum possible reward" is the wrong');
console.log('  objective: it optimises a number the market rarely delivers.');

// ---------------------------------------------------------------- 2. target grid
step('Phase 12 — expected value of each target configuration');
const TARGETS = {
  'production (structure, TP3 floored at 5R)': { targetPolicy: 'production', targetCfg: {} },
  'fixed 1 / 2 / 3R': { targetPolicy: 'fixedR', targetCfg: { rMultiples: [1, 2, 3] } },
  'fixed 1.5 / 2.5 / 4R': { targetPolicy: 'fixedR', targetCfg: { rMultiples: [1.5, 2.5, 4] } },
  'fixed 2 / 3 / 5R': { targetPolicy: 'fixedR', targetCfg: { rMultiples: [2, 3, 5] } },
  'fixed 1 / 1.5 / 2R': { targetPolicy: 'fixedR', targetCfg: { rMultiples: [1, 1.5, 2] } },
  'fixed 0.75 / 1.5 / 2.5R': { targetPolicy: 'fixedR', targetCfg: { rMultiples: [0.75, 1.5, 2.5] } },
  'structure levels': { targetPolicy: 'structure', targetCfg: { rMultiples: [1, 2, 3], minTargetR: 0.8 } },
};
const STOPS = {
  'production': 'production',
  'structure + ATR buffer': 'structure_atr',
  'swing invalidation': 'swing',
  'ATR 1.5x': 'atr',
  'volatility adjusted': 'volatility_adjusted',
};

const grid = [];
console.log('  stop policy            target configuration                        dev        val     dev+val');
for (const [sname, stopPolicy] of Object.entries(STOPS)) {
  for (const [tname, t] of Object.entries(TARGETS)) {
    const mk = longOnly({ stopPolicy, targetPolicy: t.targetPolicy, targetCfg: t.targetCfg, minRR: 0, rrLeg: 'rr1' });
    const dev = M(runIn(PERIODS.development, mk(), { risk: RISK }).trades);
    const val = M(runIn(PERIODS.validation, mk(), { risk: RISK }).trades);
    const combined = (dev.expectancy * dev.trades + val.expectancy * val.trades) / Math.max(1, dev.trades + val.trades);
    grid.push({ stop: sname, target: tname, dev: brief(dev), val: brief(val), selectionScore: r(combined) });
    console.log(`  ${sname.padEnd(22)} ${tname.padEnd(42)} ${(dev.expectancy >= 0 ? '+' : '') + dev.expectancy.toFixed(3)}  ${(val.expectancy >= 0 ? '+' : '') + val.expectancy.toFixed(3)}  ${(combined >= 0 ? '+' : '') + combined.toFixed(3)}`);
  }
}

// Chosen on development + validation only, requiring a usable sample in both.
const eligible = grid.filter((g) => g.dev.trades >= 100 && g.val.trades >= 50);
eligible.sort((a, b) => b.selectionScore - a.selectionScore);
const chosen = eligible[0];
console.log(`\n  Chosen on development+validation: ${chosen.stop}  /  ${chosen.target}  (${chosen.selectionScore}R)`);
const shipped = grid.find((g) => g.stop === 'production' && g.target.startsWith('production'));
console.log(`  Shipped configuration for comparison: ${shipped.selectionScore}R`);

// ---------------------------------------------------------------- 3. check on the final test
step('The chosen configuration on the final test (a check, not an input)');
const chosenStop = Object.entries(STOPS).find(([k]) => k === chosen.stop)[1];
const chosenTarget = TARGETS[chosen.target];
const chosenMk = longOnly({ stopPolicy: chosenStop, targetPolicy: chosenTarget.targetPolicy, targetCfg: chosenTarget.targetCfg, minRR: 0, rrLeg: 'rr1' });
const finT = runIn(PERIODS.finalTest, chosenMk(), { risk: RISK }).trades;
const finM = M(finT);
const oosT = [...runIn(PERIODS.validation, chosenMk(), { risk: RISK }).trades, ...finT];
const oosSig = significance(oosT.map((x) => x.rMultiple));
console.log(`  chosen  final test ${JSON.stringify(brief(finM))}`);
console.log(`  chosen  pooled OOS ${JSON.stringify(brief(M(oosT)))} ci95=[${oosSig.ci95?.map((x) => r(x, 3)).join(', ')}]`);
const shippedMk = longOnly();
const shippedFin = M(runIn(PERIODS.finalTest, shippedMk(), { risk: RISK }).trades);
console.log(`  shipped final test ${JSON.stringify(brief(shippedFin))}`);

writeResult('targets', {
  reachability: reach,
  grid,
  chosen: { stop: chosen.stop, target: chosen.target, selectionScore: chosen.selectionScore, finalTest: brief(finM), outOfSample: { ...brief(M(oosT)), ci95: oosSig.ci95?.map((x) => r(x, 3)) } },
  shipped: { selectionScore: shipped.selectionScore, finalTest: brief(shippedFin) },
}, { note: 'Stop/target chosen on development+validation; final test reported as a check.' });
console.log('\n-> quant/results/targets.json');
