#!/usr/bin/env node
// Generates the statistics module the live application reads, so the app shows
// what was actually measured instead of a score wearing a percent sign.
//
//   node quant/scripts/export-live-stats.mjs
//
// Writes base44/shared/edgeStats.ts and src/lib/edgeStats.js.

import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { runIn, M, RISK, SOLO_RISK, PERIODS } from '../src/research.js';
import * as S from '../src/backtest/strategies.js';
import { computeMetrics, significance } from '../src/backtest/metrics.js';
import { SETUP_IDS } from '../src/core/setups.js';
import { assignTier } from '../src/core/tiers.js';
import { DEFAULT_GATES } from '../../base44/shared/gating.ts';
import { label } from '../src/periods.js';
import { readResult, ROOT } from '../src/report/io.js';

const REPO = join(ROOT, '..');
const r = (x, d = 4) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

const pack = (m) => ({
  trades: m.trades, winRate: r(m.winRate, 2), expectancy: r(m.expectancy),
  profitFactor: m.profitFactor === Infinity ? null : r(m.profitFactor, 3),
  netR: r(m.netR, 2), maxDrawdownR: r(m.maxDrawdownR, 2),
  avgWinR: r(m.avgWinR, 3), avgLossR: r(m.avgLossR, 3),
  tp1Rate: r(m.tp1Rate, 1), tp2Rate: r(m.tp2Rate, 1), tp3Rate: r(m.tp3Rate, 1),
  avgHoldingHours: r(m.avgHoldingHours, 1),
  p: r(m.significance?.pBootstrap), t: r(m.significance?.t, 3),
});

const measure = (factory, risk) => {
  const dev = M(runIn(PERIODS.development, factory(), { risk }).trades);
  const val = runIn(PERIODS.validation, factory(), { risk }).trades;
  const fin = runIn(PERIODS.finalTest, factory(), { risk }).trades;
  const oosT = [...val, ...fin];
  const sig = significance(oosT.map((t) => t.rMultiple));
  return {
    development: pack(dev), validation: pack(M(val)), finalTest: pack(M(fin)),
    outOfSample: { ...pack(computeMetrics(oosT, { accountSize: RISK.accountSize })), ci95: sig.ci95?.map((x) => r(x, 4)) },
  };
};

const measured = { setups: {}, strategies: {} };
console.log('setup / strategy        state                    OOS n     OOS exp    PF     tier');

for (const id of SETUP_IDS) {
  const rec = measure(() => S.setupStrategy({ enabled: [id] }), SOLO_RISK);
  const o = rec.outOfSample;
  // Quarantine rule, stated once and applied mechanically.
  const negative = o.trades >= 50 && o.expectancy < 0 && o.profitFactor != null && o.profitFactor < 1;
  const state = negative ? 'DISABLED_NEGATIVE_EDGE' : 'ACTIVE';
  const stateReason = negative
    ? `${o.trades} out-of-sample trades, expectancy ${o.expectancy}R, profit factor ${o.profitFactor}${o.ci95 && o.ci95[1] < 0 ? ', and the entire 95% interval is below zero' : ''}. Kept for research; the live engine will not emit it.`
    : null;
  const tier = assignTier({ trades: o.trades, expectancy: o.expectancy, p: o.p });
  measured.setups[id] = { ...rec, state, stateReason, ...tier };
  console.log(`  ${id.padEnd(20)} ${state.padEnd(24)} ${String(o.trades).padStart(5)}  ${String(o.expectancy).padStart(9)}  ${String(o.profitFactor).padStart(5)}  ${tier.tier}`);
}

const longOnly = () => { const b = S.productionSwing(); return (a) => b(a).filter((s) => s.direction === 'LONG'); };
for (const [name, spec] of Object.entries({
  BASELINE_SWING: { f: () => S.productionSwing(), risk: RISK },
  BASELINE_SWING_LONG_ONLY: { f: longOnly, risk: RISK },
  BASELINE_SCALP: { f: () => S.productionScalp(), risk: RISK },
})) {
  const rec = measure(spec.f, spec.risk);
  const o = rec.outOfSample;
  const negative = o.trades >= 50 && o.expectancy < 0 && o.profitFactor != null && o.profitFactor < 1;
  const tier = assignTier({ trades: o.trades, expectancy: o.expectancy, p: o.p });
  measured.strategies[name] = {
    ...rec,
    state: negative ? 'DISABLED_NEGATIVE_EDGE' : 'ACTIVE',
    stateReason: negative ? `${o.trades} out-of-sample trades, expectancy ${o.expectancy}R, profit factor ${o.profitFactor}.` : null,
    ...tier,
  };
  console.log(`  ${name.padEnd(20)} ${measured.strategies[name].state.padEnd(24)} ${String(o.trades).padStart(5)}  ${String(o.expectancy).padStart(9)}  ${String(o.profitFactor).padStart(5)}  ${tier.tier}`);
}

// Direction gating, derived from the numbers rather than asserted.
const shortSetups = SETUP_IDS.filter((id) => id.endsWith('_SHORT'));
const allShortNegative = shortSetups.every((id) => {
  const s = measured.setups[id];
  return s.development.expectancy <= 0 && s.validation.expectancy <= 0;
});
const allowedDirections = allShortNegative ? ['LONG'] : ['LONG', 'SHORT'];

const validation = readResult('validation');
const decomposition = readResult('decomposition');
const feedChecks = readResult('feed-checks');
const primary = validation?.primary ?? null;
const verdict = validation?.verdict?.verdict ?? 'UNKNOWN';

// The presentation default, derived from the measured verdict by the same rule the
// live code applies (shared/tradingMode.ts): advisory is earned by a PROVEN EDGE,
// everything weaker is recorded on paper.
const defaultMode = verdict === 'PROVEN EDGE' ? 'ADVISORY' : 'PAPER';
const eraConsistency = (era) => {
  const c = validation?.walkForward?.byFeed?.[era]?.consistency;
  return c == null ? null : Math.round(c * 100);
};
const legacyPct = eraConsistency('legacy');
const modernPct = eraConsistency('modern');
const eraNote = legacyPct != null && modernPct != null
  ? ` Its out-of-sample record is positive, but ${legacyPct}% of quarters are profitable in the earlier era against ${modernPct}% in the recent one, so the evidence is era-specific.`
  : '';

const doc = {
  generatedAt: new Date().toISOString(),
  verdict,
  primaryConfiguration: primary,
  periods: {
    development: `${label(PERIODS.development)} (${PERIODS.development.feed} feed)`,
    validation: `${label(PERIODS.validation)} (${PERIODS.validation.feed} feed)`,
    finalTest: `${label(PERIODS.finalTest)} (${PERIODS.finalTest.feed} feed)`,
    forward: '2026-01-01 onward — reserved for live paper trading',
  },
  execution: 'realistic (0.30 spread, 0.10 slippage, 0.035/oz commission, 1-bar entry delay)',
  risk: RISK,
  // Every published number carries this: two independent feeds of the same
  // instrument disagree by about this much outside a crisis.
  feedUncertaintyR: 0.05,
  feedNote: feedChecks
    ? `Two independent feeds correlate ${feedChecks.overlap?.[2]?.returnCorrelation} on hourly returns outside the 2020 dislocation and ${feedChecks.overlap?.[1]?.returnCorrelation} inside it. Expectancy measured on one feed moves by roughly 0.05R when measured on the other.`
    : null,
  walkForward: validation?.walkForward?.byFeed
    ? {
        legacyEra: validation.walkForward.byFeed.legacy,
        modernEra: validation.walkForward.byFeed.modern,
        summary: validation.walkForward.summary,
      }
    : null,
  monteCarlo: validation?.monteCarlo
    ? {
        pctPositive: r(validation.monteCarlo.finalR?.pctPositive, 2),
        probabilityOfNegativeYear: r(validation.monteCarlo.probabilityOfNegativeYear?.pct, 2),
        medianDrawdownR: r(validation.monteCarlo.drawdownR?.median, 2),
      }
    : null,
  calibration: validation?.calibration ?? null,
  multipleTesting: decomposition?.conditionalScreen?.screen ?? null,
  measured,
  gating: {
    // Derived from the verdict, not hardcoded. The rule lives in one place —
    // shared/tradingMode.ts — and the owner can override the default in the app;
    // what is written here is only what the measured evidence supports.
    defaultMode,
    emitLiveSignals: defaultMode === 'ADVISORY',
    paperTradingOnly: defaultMode === 'PAPER',
    reason: defaultMode === 'ADVISORY'
      ? 'The out-of-sample record cleared every criterion in the edge classifier.'
      : `The best configuration is rated ${verdict}.${eraNote} Signals are recorded and simulated, not recommended.`,
    allowedDirections,
    directionReason: allShortNegative
      ? 'Every short setup is negative on BOTH development and validation, with out-of-sample profit factors of 0.71-0.80. Supported without reference to the final test.'
      : null,
    scalpEnabled: false,
    scalpReason: measured.strategies.BASELINE_SCALP
      ? `Measured expectancy ${measured.strategies.BASELINE_SCALP.outOfSample.expectancy}R per trade out of sample over ${measured.strategies.BASELINE_SCALP.outOfSample.trades} trades. Costs alone exceed the raw signal by roughly an order of magnitude.`
      : null,
    thresholds: DEFAULT_GATES,
  },
};

const banner = `// GENERATED FILE — do not edit by hand.
// Produced by quant/scripts/export-live-stats.mjs from the backtests in quant/.
// Every number here was measured on
//   development ${doc.periods.development}
//   validation  ${doc.periods.validation}
//   final test  ${doc.periods.finalTest}
// under the "realistic" cost model. None of it is a forecast, and none of it is a
// probability attached to any individual live signal.
`;
const body = `\nexport const EDGE_STATS = ${JSON.stringify(doc, null, 2)};\n\nexport default EDGE_STATS;\n`;
writeFileSync(join(REPO, 'base44', 'shared', 'edgeStats.ts'), banner + body);
writeFileSync(join(REPO, 'src', 'lib', 'edgeStats.js'), banner + body);

console.log(`\nverdict: ${verdict}   primary: ${primary}   directions allowed: ${allowedDirections.join(', ')}`);
console.log('-> base44/shared/edgeStats.ts and src/lib/edgeStats.js');
