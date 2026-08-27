import { loadGoldDataset } from '../src/data/dataset.js';
import { buildContext } from '../src/core/context.js';
import { runBacktest } from '../src/backtest/engine.js';
import { computeMetrics } from '../src/backtest/metrics.js';
import { productionSwing } from '../src/backtest/strategies.js';
import { buildCalendar, makeNewsWindow } from '../src/core/calendar.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'normalized');
let t = Date.now();
const ds = loadGoldDataset(DIR);
console.log('load', Date.now() - t, 'ms');

t = Date.now();
const ctx = buildContext({ m15: ds.m15, h1: ds.h1, h4: ds.h4, d1: ds.d1, macro: { dxy: ds.dxy } });
console.log('context', Date.now() - t, 'ms');

const events = buildCalendar(ds.h1.candles[0].openTime, ds.h1.candles.at(-1).closeTime);
const news = makeNewsWindow(events, { beforeMin: 15, afterMin: 15 });
console.log('calendar events', events.length, 'exact-high windows', news.count);

t = Date.now();
const res = runBacktest({
  ctx, strategy: productionSwing(), execution: 'realistic', newsWindow: news,
  risk: { accountSize: 10000, riskPerTradePct: 1, maxConcurrentTrades: 2 },
});
console.log('backtest', Date.now() - t, 'ms, trades', res.trades.length, 'skipped', res.skipped);
const m = computeMetrics(res.trades);
console.log(JSON.stringify({
  trades: m.trades, winRate: +m.winRate?.toFixed(2), netR: +m.netR.toFixed(1),
  expectancy: +m.expectancy?.toFixed(4), pf: m.profitFactor === Infinity ? 'inf' : +m.profitFactor?.toFixed(3),
  maxDDR: +m.maxDrawdownR.toFixed(1), maxDDpct: +m.maxDrawdownPct.toFixed(1),
  avgHoldH: +m.avgHoldingHours?.toFixed(1), tp1: +m.tp1Rate?.toFixed(1), tp3: +m.tp3Rate?.toFixed(1),
  finalEquity: +m.finalEquity.toFixed(0), cagr: m.cagr == null ? null : +m.cagr.toFixed(2),
}, null, 2));
