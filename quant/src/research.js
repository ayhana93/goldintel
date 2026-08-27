// Shared research harness.
//
// Two feeds cover different periods, so every study needs to run against the
// context that actually holds the bars for the period it is asking about. This
// module owns that mapping so no script can accidentally test the modern period
// against the legacy feed, or vice versa.

import { join } from 'node:path';
import { loadGoldDataset } from './data/dataset.js';
import { buildContext } from './core/context.js';
import { buildCalendar, makeNewsWindow } from './core/calendar.js';
import { runBacktest } from './backtest/engine.js';
import { computeMetrics, significance } from './backtest/metrics.js';
import { PERIODS, feedFor } from './periods.js';
import { ROOT } from './report/io.js';

export const DIR = join(ROOT, 'data', 'normalized');

export const RISK = { accountSize: 10000, riskPerTradePct: 1, maxConcurrentTrades: 2, maxDailyLossPct: 3, maxWeeklyLossPct: 6 };
/** Per-setup measurement: one position at a time, so a setup's statistics do not
 *  depend on which OTHER setup happened to be holding the concurrency slot. */
export const SOLO_RISK = { ...RISK, maxConcurrentTrades: 1 };

const cache = new Map();

/** Build (once) and return the context and calendar for one feed. */
export function feedContext(feed, options = {}) {
  const key = `${feed}|${JSON.stringify(options)}`;
  if (cache.has(key)) return cache.get(key);
  const ds = loadGoldDataset(DIR, feed);
  const ctx = buildContext({ m15: ds.m15, h1: ds.h1, h4: ds.h4, d1: ds.d1, macro: { dxy: ds.dxy }, options });
  const events = buildCalendar(ds.h1.candles[0].openTime, ds.h1.candles.at(-1).closeTime);
  const entry = {
    feed, ds, ctx, events,
    // The cost model always knows about releases; only the entry FILTER varies.
    costNews: makeNewsWindow(events, { beforeMin: 10, afterMin: 20 }),
    highImpact: events.filter((e) => e.precision === 'exact' && e.importance === 'high'),
  };
  cache.set(key, entry);
  return entry;
}

/** Run one strategy over one period, on that period's own feed. */
export function runIn(period, strategy, {
  risk = RISK, execution = 'realistic', options = {}, contextOptions = {}, newsWindow,
} = {}) {
  const f = feedContext(feedFor(period), contextOptions);
  return runBacktest({
    ctx: f.ctx, strategy, execution, risk,
    newsWindow: newsWindow === undefined ? f.costNews : newsWindow,
    fromMs: period.from, toMs: period.to, options,
  });
}

export const M = (trades) => computeMetrics(trades, { accountSize: RISK.accountSize });

/**
 * Pooled out-of-sample record: validation + final test.
 *
 * This is the only sample that can speak to a setup CHOSEN using development
 * data — the selection never saw it, so its statistics are not inflated by
 * having been picked. Both periods live on the modern feed.
 */
export function outOfSample(strategyFactory, opts = {}) {
  const t = [
    ...runIn(PERIODS.validation, strategyFactory(), opts).trades,
    ...runIn(PERIODS.finalTest, strategyFactory(), opts).trades,
  ];
  return { trades: t, metrics: M(t), significance: significance(t.map((x) => x.rMultiple)) };
}

/** Compact metric view for console tables and result files. */
export function brief(m) {
  const r = (x, d = 4) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
  return {
    trades: m.trades,
    winRate: r(m.winRate, 2),
    expectancy: r(m.expectancy),
    profitFactor: m.profitFactor === Infinity ? null : r(m.profitFactor, 3),
    netR: r(m.netR, 1),
    maxDrawdownR: r(m.maxDrawdownR, 1),
    sharpe: r(m.sharpe, 2),
    p: r(m.significance?.pBootstrap),
    t: r(m.significance?.t, 2),
  };
}

export { PERIODS };
