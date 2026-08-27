#!/usr/bin/env node
// Generates the statistics module the live application reads, so the app can
// show what was actually measured instead of a score wearing a percent sign.
//
// Writes base44/shared/edgeStats.ts and src/lib/edgeStats.js (identical content,
// two import styles). Regenerate with:
//   node quant/scripts/export-live-stats.mjs

import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { loadGoldDataset } from '../src/data/dataset.js';
import { buildContext } from '../src/core/context.js';
import { buildCalendar, makeNewsWindow } from '../src/core/calendar.js';
import { runBacktest } from '../src/backtest/engine.js';
import { computeMetrics, significance } from '../src/backtest/metrics.js';
import { setupStrategy, productionSwing, productionScalp } from '../src/backtest/strategies.js';
import { SETUP_IDS } from '../src/core/setups.js';
import { assignTier, TIER_RULES } from '../src/core/tiers.js';
import { PERIODS, label } from '../src/periods.js';
import { readResult, ROOT } from '../src/report/io.js';

const REPO = join(ROOT, '..');
const DIR = join(ROOT, 'data', 'normalized');
const RISK = { accountSize: 10000, riskPerTradePct: 1, maxConcurrentTrades: 1, maxDailyLossPct: 3, maxWeeklyLossPct: 6 };

const ds = loadGoldDataset(DIR);
const ctx = buildContext({ m15: ds.m15, h1: ds.h1, h4: ds.h4, d1: ds.d1, macro: { dxy: ds.dxy } });
const events = buildCalendar(ds.h1.candles[0].openTime, ds.h1.candles.at(-1).closeTime);
const costNews = makeNewsWindow(events, { beforeMin: 10, afterMin: 20 });

const tradesIn = (strategy, period, risk = RISK) => runBacktest({
  ctx, strategy, execution: 'realistic', risk, newsWindow: costNews,
  fromMs: period.from, toMs: period.to,
}).trades;
const run = (strategy, period, risk = RISK) =>
  computeMetrics(tradesIn(strategy, period, risk), { accountSize: RISK.accountSize });

/**
 * Everything after the development period, pooled. This is the only sample that
 * can speak to a setup that was CHOSEN using development data: the selection
 * never saw it, so its statistics are not inflated by having been picked.
 */
const outOfSample = (strategy, risk = RISK) => {
  const trades = [
    ...tradesIn(strategy, PERIODS.validation, risk),
    ...tradesIn(strategy, PERIODS.finalTest, risk),
  ];
  const m = computeMetrics(trades, { accountSize: RISK.accountSize });
  return { metrics: m, significance: significance(trades.map((t) => t.rMultiple)) };
};

const pack = (m) => ({
  trades: m.trades,
  winRate: r(m.winRate, 2),
  expectancy: r(m.expectancy, 4),
  profitFactor: m.profitFactor === Infinity ? null : r(m.profitFactor, 3),
  netR: r(m.netR, 2),
  maxDrawdownR: r(m.maxDrawdownR, 2),
  avgWinR: r(m.avgWinR, 3),
  avgLossR: r(m.avgLossR, 3),
  tp1Rate: r(m.tp1Rate, 1),
  tp2Rate: r(m.tp2Rate, 1),
  tp3Rate: r(m.tp3Rate, 1),
  avgHoldingHours: r(m.avgHoldingHours, 1),
  p: r(m.significance?.pBootstrap, 4),
  t: r(m.significance?.t, 3),
});

const measured = { setups: {}, strategies: {} };

for (const id of SETUP_IDS) {
  const strat = () => setupStrategy({ enabled: [id] });
  const dev = run(strat(), PERIODS.development);
  const val = run(strat(), PERIODS.validation);
  const fin = run(strat(), PERIODS.finalTest);
  const oos = outOfSample(strat());
  const tier = assignTier({
    trades: oos.metrics.trades,
    expectancy: oos.metrics.expectancy,
    p: oos.significance?.pBootstrap,
  });
  measured.setups[id] = {
    development: pack(dev), validation: pack(val), finalTest: pack(fin),
    outOfSample: { ...pack(oos.metrics), ci95: oos.significance?.ci95?.map((x) => r(x, 4)) },
    ...tier,
  };
  console.log(`${id.padEnd(20)} ${tier.tier.padEnd(8)} dev=${String(r(dev.expectancy, 3)).padStart(7)} OOS n=${String(oos.metrics.trades).padStart(4)} exp=${String(r(oos.metrics.expectancy, 3)).padStart(7)} p=${r(oos.significance?.pBootstrap, 4)}`);
}

const stratDefs = {
  BASELINE_SWING: { fn: () => productionSwing(), risk: { ...RISK, maxConcurrentTrades: 2 } },
  BASELINE_SCALP: { fn: () => productionScalp(), risk: { ...RISK, maxConcurrentTrades: 2 } },
};
for (const [name, d] of Object.entries(stratDefs)) {
  const dev = run(d.fn(), PERIODS.development, d.risk);
  const val = run(d.fn(), PERIODS.validation, d.risk);
  const fin = run(d.fn(), PERIODS.finalTest, d.risk);
  const oos = outOfSample(d.fn(), d.risk);
  const tier = assignTier({
    trades: oos.metrics.trades,
    expectancy: oos.metrics.expectancy,
    p: oos.significance?.pBootstrap,
  });
  measured.strategies[name] = {
    development: pack(dev), validation: pack(val), finalTest: pack(fin),
    outOfSample: { ...pack(oos.metrics), ci95: oos.significance?.ci95?.map((x) => r(x, 4)) },
    ...tier,
  };
  console.log(`${name.padEnd(20)} ${tier.tier.padEnd(8)} dev=${String(r(dev.expectancy, 3)).padStart(7)} OOS n=${String(oos.metrics.trades).padStart(4)} exp=${String(r(oos.metrics.expectancy, 3)).padStart(7)} p=${r(oos.significance?.pBootstrap, 4)}`);
}

const finalResult = readResult('final-test');
const validationResult = readResult('validation');

const doc = {
  generatedAt: new Date().toISOString(),
  verdict: finalResult?.finalVerdict ?? 'UNKNOWN',
  verdicts: finalResult?.verdicts ?? {},
  periods: {
    development: label(PERIODS.development),
    validation: label(PERIODS.validation),
    finalTest: label(PERIODS.finalTest),
  },
  execution: 'realistic (0.30 spread, 0.10 slippage, 0.035/oz commission, 1-bar entry delay)',
  risk: RISK,
  walkForward: validationResult?.walkForward?.summary
    ? {
        windows: validationResult.walkForward.summary.totalWindows,
        profitableWindows: validationResult.walkForward.summary.profitableWindows,
        consistency: r(validationResult.walkForward.summary.consistency, 3),
        meanOutOfSampleExpectancy: r(validationResult.walkForward.summary.meanOutOfSampleExpectancy, 4),
        stitchedExpectancy: r(validationResult.walkForward.summary.stitchedOutOfSample?.expectancy, 4),
      }
    : null,
  monteCarlo: finalResult?.monteCarlo
    ? {
        pctPositive: r(finalResult.monteCarlo.finalR?.pctPositive, 2),
        probabilityOfNegativeYear: r(finalResult.monteCarlo.probabilityOfNegativeYear?.pct, 2),
        medianDrawdownR: r(finalResult.monteCarlo.drawdownR?.median, 2),
      }
    : null,
  measured,
  // What the live system is allowed to do, derived from the numbers above.
  tierRules: TIER_RULES,
  gating: {
    emitLiveSignals: false,
    paperTradingOnly: true,
    scalpEnabled: false,
    scalpReason: 'Measured expectancy of -0.35R to -0.44R per trade across all three periods, t = -6.8 on the final test. Costs alone exceed the raw signal by roughly an order of magnitude.',
    swingReason: 'No period shows expectancy distinguishable from zero after realistic costs; the final test is negative.',
  },
};

const banner = `// GENERATED FILE — do not edit by hand.
// Produced by quant/scripts/export-live-stats.mjs from the backtests in quant/.
// Every number here was measured on ${doc.periods.development} / ${doc.periods.validation} / ${doc.periods.finalTest}
// under the "realistic" cost model. None of it is a forecast, and none of it is
// a probability attached to any individual live signal.
`;
const body = `\nexport const EDGE_STATS = ${JSON.stringify(doc, null, 2)};\n\nexport default EDGE_STATS;\n`;

writeFileSync(join(REPO, 'base44', 'shared', 'edgeStats.ts'), banner + body);
writeFileSync(join(REPO, 'src', 'lib', 'edgeStats.js'), banner + body);
console.log('\n-> base44/shared/edgeStats.ts and src/lib/edgeStats.js');

function r(x, d) {
  return x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d;
}
