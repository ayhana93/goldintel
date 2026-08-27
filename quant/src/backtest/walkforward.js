// Phase 17 — walk-forward validation.
//
// A single backtest over the whole history tells you what a parameter set that
// already saw the whole history would have done. Walk-forward asks the only
// question that matters: choose on what you have seen, then trade what you have
// not, and repeat. Degradation between the two is the measurable part of
// overfitting.

import { runBacktest } from './engine.js';
import { computeMetrics } from './metrics.js';

const MONTH = 30 * 24 * 3600 * 1000;

/** Rolling [train, test] windows across a period. */
export function makeWindows({ fromMs, toMs, trainMonths = 12, testMonths = 3, step = null }) {
  const train = trainMonths * MONTH;
  const test = testMonths * MONTH;
  const stride = (step ?? testMonths) * MONTH;
  const windows = [];
  let trainStart = fromMs;
  while (trainStart + train + test <= toMs) {
    windows.push({
      trainFrom: trainStart, trainTo: trainStart + train,
      testFrom: trainStart + train, testTo: trainStart + train + test,
    });
    trainStart += stride;
  }
  return windows;
}

/**
 * @param selectFn ({ ctx, window, run }) => chosenConfig
 *                 Called with the TRAINING window only. It may run as many
 *                 backtests as it likes inside that window; it must never be
 *                 given testFrom/testTo.
 * @param buildStrategy (config) => strategy
 */
export function walkForward({
  ctx, windows, candidates, buildStrategy, selectFn = null,
  execution = 'realistic', risk = {}, newsWindow = null, options = {}, metricsOpts = {},
}) {
  const results = [];

  for (const w of windows) {
    // ---- selection, on training data only ----
    const scored = candidates.map((cfg) => {
      const r = runBacktest({
        ctx, strategy: buildStrategy(cfg), execution, risk, newsWindow,
        fromMs: w.trainFrom, toMs: w.trainTo, options,
      });
      return { cfg, metrics: computeMetrics(r.trades, metricsOpts), trades: r.trades.length };
    });

    const chosen = selectFn
      ? selectFn({ scored, window: w })
      : scored
          .filter((s) => s.trades >= 20)
          .sort((a, b) => (b.metrics.expectancy ?? -Infinity) - (a.metrics.expectancy ?? -Infinity))[0]
        ?? scored[0];

    // ---- evaluation, on data the selection never saw ----
    const test = runBacktest({
      ctx, strategy: buildStrategy(chosen.cfg), execution, risk, newsWindow,
      fromMs: w.testFrom, toMs: w.testTo, options,
    });
    const testMetrics = computeMetrics(test.trades, metricsOpts);

    results.push({
      window: {
        trainFrom: new Date(w.trainFrom).toISOString().slice(0, 10),
        trainTo: new Date(w.trainTo).toISOString().slice(0, 10),
        testFrom: new Date(w.testFrom).toISOString().slice(0, 10),
        testTo: new Date(w.testTo).toISOString().slice(0, 10),
      },
      chosen: chosen.cfg,
      inSample: chosen.metrics,
      outOfSample: testMetrics,
      testTrades: test.trades,
    });
  }

  // ---- aggregate the out-of-sample legs into one continuous record ----
  const allOos = results.flatMap((r) => r.testTrades);
  const oosAll = computeMetrics(allOos, metricsOpts);
  const isExp = results.map((r) => r.inSample.expectancy).filter((x) => x != null);
  const oosExp = results.map((r) => r.outOfSample.expectancy).filter((x) => x != null);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

  return {
    windows: results.map(({ testTrades, ...rest }) => rest),
    oosTrades: allOos,
    summary: {
      windowCount: results.length,
      meanInSampleExpectancy: mean(isExp),
      meanOutOfSampleExpectancy: mean(oosExp),
      degradation: mean(isExp) != null && mean(oosExp) != null ? mean(isExp) - mean(oosExp) : null,
      profitableWindows: oosExp.filter((x) => x > 0).length,
      totalWindows: oosExp.length,
      consistency: oosExp.length ? oosExp.filter((x) => x > 0).length / oosExp.length : null,
      stitchedOutOfSample: oosAll,
    },
  };
}
