// Backtest engine behaviour, checked on a synthetic market whose outcome is
// known by construction, plus the validation machinery.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSeries } from '../src/core/candles.js';
import { buildContext } from '../src/core/context.js';
import { runBacktest } from '../src/backtest/engine.js';
import { computeMetrics, maxDrawdown, significance, rHistogram, maeMfeStudy } from '../src/backtest/metrics.js';
import { makeWindows } from '../src/backtest/walkforward.js';
import { monteCarlo } from '../src/backtest/montecarlo.js';
import { classifyEdge } from '../src/backtest/edge.js';
import { assignTier } from '../src/core/tiers.js';
import { buildCalendar, makeNewsWindow, isUsDst, easternToUtc } from '../src/core/calendar.js';
import { pearson } from '../src/backtest/correlation.js';
import { HOUR, MINUTE, sessionOf, utcWeekKey, isEuSummerTime } from '../src/core/time.js';

/** A market that drifts up steadily, so a long should reach its target. */
function rampMarket(bars, tf, startMs, slopePerBar) {
  const candles = [];
  for (let i = 0; i < bars; i++) {
    const base = 2000 + i * slopePerBar;
    candles.push({
      openTime: startMs + i * (tf === 'M15' ? 15 * MINUTE : tf === 'H1' ? HOUR : tf === 'H4' ? 4 * HOUR : 24 * HOUR),
      open: base, high: base + 1.5, low: base - 1.5, close: base + slopePerBar * 0.5, volume: 100,
    });
  }
  for (const c of candles) {
    c.high = Math.max(c.high, c.open, c.close);
    c.low = Math.min(c.low, c.open, c.close);
  }
  return makeSeries({ symbol: 'SYNTH', timeframe: tf, source: 'test', candles, now: Number.POSITIVE_INFINITY });
}

function synthContext({ bars = 4000, slope = 0.15 } = {}) {
  const start = Date.UTC(2020, 0, 1);
  const m15 = rampMarket(bars, 'M15', start, slope / 4);
  const h1 = rampMarket(Math.floor(bars / 4), 'H1', start, slope);
  const h4 = rampMarket(Math.floor(bars / 16), 'H4', start, slope * 4);
  const d1 = rampMarket(Math.floor(bars / 96), 'D1', start, slope * 24);
  return buildContext({ m15, h1, h4, d1 });
}

test('a long in a rising market reaches its target and the R is positive', () => {
  const ctx = synthContext();
  let fired = false;
  const res = runBacktest({
    ctx,
    strategy: ({ price, atr }) => {
      if (fired || atr == null) return [];
      fired = true;
      return [{
        setupId: 'TEST', direction: 'LONG', tier: 'swing',
        plan: { entry: price, sl: price - 10, risk: 10, tp1: price + 10, tp2: price + 20, tp3: price + 30, rr1: 1, rr2: 2, rr3: 3 },
      }];
    },
    execution: 'zero',
    risk: { accountSize: 10000, riskPerTradePct: 1, maxConcurrentTrades: 1 },
  });
  assert.equal(res.trades.length, 1);
  const t = res.trades[0];
  assert.ok(t.tp1Hit, 'the target should have been reached in a market that only goes up');
  assert.ok(t.rMultiple > 0, `expected a profit, got ${t.rMultiple}R`);
  assert.ok(t.mfe > t.mae, 'a winner should have run further in favour than against');
});

test('when a bar contains both the stop and the target, the STOP is taken', () => {
  // A single bar that spans both levels. Intrabar order is unknowable at this
  // resolution, so the engine must take the pessimistic reading.
  const start = Date.UTC(2020, 0, 1);
  // The wide bar sits at M15 index 200, comfortably after the first D1 bar has
  // closed - the engine will not take a decision until it has a closed daily bar.
  const WIDE_M15 = 200;
  const mk = (tf, n, step) => {
    const candles = [];
    for (let i = 0; i < n; i++) {
      const wide = tf === 'M15' && i === WIDE_M15;
      candles.push({
        openTime: start + i * step,
        open: 2000, high: wide ? 2100 : 2001, low: wide ? 1900 : 1999, close: 2000, volume: 1,
      });
    }
    return makeSeries({ symbol: 'S', timeframe: tf, source: 'test', candles, now: Number.POSITIVE_INFINITY });
  };
  const ctx = buildContext({
    m15: mk('M15', 400, 15 * MINUTE), h1: mk('H1', 100, HOUR),
    h4: mk('H4', 60, 4 * HOUR), d1: mk('D1', 60, 24 * HOUR),
  });
  let fired = false;
  const res = runBacktest({
    ctx,
    strategy: ({ price, bar }) => {
      // Fire so the fill lands a few bars before the wide bar.
      if (fired || bar.openTime < start + (WIDE_M15 - 10) * 15 * MINUTE) return [];
      fired = true;
      return [{ setupId: 'T', direction: 'LONG', tier: 'swing',
        plan: { entry: price, sl: price - 20, risk: 20, tp1: price + 20, tp2: price + 40, tp3: price + 60, rr1: 1, rr2: 2, rr3: 3 } }];
    },
    execution: 'zero',
    risk: { accountSize: 10000, riskPerTradePct: 1, maxConcurrentTrades: 1 },
  });
  assert.equal(res.trades.length, 1);
  assert.ok(res.trades[0].rMultiple < 0, 'the ambiguous bar must be resolved against the position');
});

test('the engine refuses to run without an M15 driver series', () => {
  const start = Date.UTC(2020, 0, 1);
  const h1 = rampMarket(100, 'H1', start, 0.1);
  const ctx = buildContext({ h1, h4: rampMarket(30, 'H4', start, 0.4), d1: rampMarket(30, 'D1', start, 2.4) });
  assert.throws(() => runBacktest({ ctx, strategy: () => [] }), /M15/);
});

test('risk limits actually block trades inside the backtest', () => {
  const ctx = synthContext();
  const res = runBacktest({
    ctx,
    strategy: ({ price, atr }) => (atr == null ? [] : [{
      setupId: 'SPAM', direction: 'LONG', tier: 'swing',
      plan: { entry: price, sl: price - 5, risk: 5, tp1: price + 5, tp2: price + 10, tp3: price + 15, rr1: 1, rr2: 2, rr3: 3 },
    }]),
    execution: 'realistic',
    risk: { accountSize: 10000, riskPerTradePct: 1, maxConcurrentTrades: 1 },
    options: { oneOpenPerSetup: true },
  });
  assert.ok(res.skipped.duplicate > 0, 'the per-setup guard should have suppressed repeats');
});

test('metrics agree with values computed by hand', () => {
  const trades = [
    { rMultiple: 2, realizedPnl: 200, riskAmount: 100, costs: 1, mae: 0.2, mfe: 2.2, tp1Hit: true, tp2Hit: true, tp3Hit: false, holdingHours: 5, entryTime: 0, exitTime: HOUR },
    { rMultiple: -1, realizedPnl: -100, riskAmount: 100, costs: 1, mae: 1, mfe: 0.3, tp1Hit: false, tp2Hit: false, tp3Hit: false, holdingHours: 3, entryTime: HOUR, exitTime: 2 * HOUR },
    { rMultiple: 1, realizedPnl: 100, riskAmount: 100, costs: 1, mae: 0.4, mfe: 1.5, tp1Hit: true, tp2Hit: false, tp3Hit: false, holdingHours: 4, entryTime: 2 * HOUR, exitTime: 3 * HOUR },
    { rMultiple: -1, realizedPnl: -100, riskAmount: 100, costs: 1, mae: 1, mfe: 0.1, tp1Hit: false, tp2Hit: false, tp3Hit: false, holdingHours: 2, entryTime: 3 * HOUR, exitTime: 4 * HOUR },
  ];
  const m = computeMetrics(trades, { accountSize: 10000 });
  assert.equal(m.trades, 4);
  assert.equal(m.wins, 2);
  assert.equal(m.losses, 2);
  assert.equal(m.winRate, 50);
  assert.equal(m.netR, 1);
  assert.equal(m.expectancy, 0.25);
  assert.equal(m.profitFactor, 1.5, 'gross win 3 over gross loss 2');
  assert.equal(m.tp1Rate, 50);
  assert.equal(m.tp3Rate, 0);
});

test('maxDrawdown finds the deepest peak-to-trough, not the last one', () => {
  const dd = maxDrawdown([0, 5, 1, 6, -4, 0]);
  assert.equal(dd.depth, 10, 'from the peak of 6 down to -4');
});

test('significance separates a real edge from a small sample', () => {
  const strong = new Array(500).fill(0).map((_, i) => (i % 2 ? 1.2 : -1));
  const s = significance(strong, { bootstrap: 2000 });
  assert.ok(s.pBootstrap < 0.05, `a 500-trade positive edge should be significant, got p=${s.pBootstrap}`);

  const tiny = [2, -1, 1.5, -1, 3];
  assert.equal(significance(tiny).t, null, 'a five-trade sample must refuse to report a statistic');
});

test('walk-forward windows never let a test period precede its own training period', () => {
  const from = Date.UTC(2015, 0, 1), to = Date.UTC(2020, 0, 1);
  const w = makeWindows({ fromMs: from, toMs: to, trainMonths: 12, testMonths: 3 });
  assert.ok(w.length > 5);
  for (const win of w) {
    assert.ok(win.trainFrom < win.trainTo);
    assert.equal(win.testFrom, win.trainTo, 'testing must begin exactly where training ended');
    assert.ok(win.testTo <= to);
  }
  for (let i = 1; i < w.length; i++) {
    assert.ok(w[i].testFrom > w[i - 1].testFrom, 'windows must advance');
  }
});

test('Monte Carlo is deterministic for a given seed and reports a wider drawdown than one path', () => {
  const trades = new Array(200).fill(0).map((_, i) => ({ rMultiple: i % 3 === 0 ? 2 : -1 }));
  const a = monteCarlo(trades, { runs: 500, seed: 1 });
  const b = monteCarlo(trades, { runs: 500, seed: 1 });
  assert.deepEqual(a.finalR, b.finalR, 'the same seed must reproduce the same result exactly');
  const c = monteCarlo(trades, { runs: 500, seed: 2 });
  assert.notDeepEqual(a.finalR, c.finalR, 'a different seed should explore a different path');
  assert.ok(a.drawdownR.p95 >= a.drawdownR.median);
  assert.ok(a.probabilityOfRuin.pct >= 0 && a.probabilityOfRuin.pct <= 100);
});

test('Monte Carlo declines to speak about a tiny sample', () => {
  assert.equal(monteCarlo([{ rMultiple: 1 }], { runs: 10 }).runs, 0);
});

test('the edge classifier calls a strong result PROVEN and a collapsed one OVERFIT', () => {
  const good = classifyEdge({
    outOfSample: { trades: 400, expectancy: 0.2, profitFactor: 1.5, maxDrawdownR: 20 },
    inSample: { expectancy: 0.22 },
    walkForward: { consistency: 0.7, degradation: 0.02 },
    sensitivity: { overfitRisk: 'LOW' },
    costScenarios: { zero: { expectancy: 0.3 }, realistic: { expectancy: 0.2 } },
  });
  assert.equal(good.verdict, 'PROVEN EDGE');

  const collapsed = classifyEdge({
    outOfSample: { trades: 300, expectancy: 0.001, profitFactor: 1.0, maxDrawdownR: 20 },
    inSample: { expectancy: 0.25 },
    walkForward: { consistency: 0.3, degradation: 0.25 },
    sensitivity: { overfitRisk: 'HIGH' },
    costScenarios: { zero: { expectancy: 0.3 }, realistic: { expectancy: 0.001 } },
  });
  assert.equal(collapsed.verdict, 'OVERFIT');

  const dead = classifyEdge({
    outOfSample: { trades: 300, expectancy: -0.05, profitFactor: 0.9, maxDrawdownR: 30 },
    inSample: { expectancy: -0.02 },
    walkForward: { consistency: 0.4, degradation: 0.03 },
    sensitivity: { overfitRisk: 'LOW' },
  });
  assert.equal(dead.verdict, 'NO EDGE');
});

test('an untested setup is NO_TRADE, not unrated', () => {
  assert.equal(assignTier(null).tier, 'NO_TRADE');
  assert.equal(assignTier({ trades: 10, expectancy: 5, p: 0 }).tier, 'NO_TRADE', 'ten trades cannot earn a tier');
  assert.equal(assignTier({ trades: 500, expectancy: 0.2, p: 0.001 }).tier, 'A+');
  assert.equal(assignTier({ trades: 100, expectancy: 0.2, p: 0.02 }).tier, 'B',
    'a promising result on a thin sample is B, not A');
});

test('the calendar puts NFP at 13:30 UTC in winter and 12:30 UTC in summer', () => {
  const events = buildCalendar(Date.UTC(2019, 0, 1), Date.UTC(2019, 11, 31));
  const nfp = events.filter((e) => e.name === 'Non-Farm Payrolls');
  assert.equal(nfp.length, 12, 'one per month');
  const jan = new Date(nfp[0].time);
  assert.equal(jan.getUTCHours(), 13, 'US winter: 08:30 Eastern is 13:30 UTC');
  assert.equal(jan.getUTCMinutes(), 30);
  const jul = new Date(nfp[6].time);
  assert.equal(jul.getUTCHours(), 12, 'US summer: 08:30 Eastern is 12:30 UTC');
  assert.equal(new Date(nfp[0].time).getUTCDay(), 5, 'NFP is a Friday');
});

test('US and EU daylight saving rules are distinct and both are applied', () => {
  // In March 2019 the US changed on the 10th and the EU on the 31st.
  assert.equal(isUsDst(Date.UTC(2019, 2, 11)), true);
  assert.equal(isEuSummerTime(Date.UTC(2019, 2, 11)), false, 'the EU had not switched yet');
  assert.equal(isEuSummerTime(Date.UTC(2019, 3, 1)), true);
  assert.equal(easternToUtc(2019, 0, 15, 8, 30), Date.UTC(2019, 0, 15, 13, 30));
});

test('the news window is a fast, correct membership test', () => {
  const events = buildCalendar(Date.UTC(2019, 0, 1), Date.UTC(2019, 11, 31));
  const w = makeNewsWindow(events, { beforeMin: 15, afterMin: 15 });
  const nfp = events.find((e) => e.name === 'Non-Farm Payrolls');
  assert.equal(w.contains(nfp.time), true);
  assert.equal(w.contains(nfp.time - 14 * MINUTE), true);
  assert.equal(w.contains(nfp.time + 14 * MINUTE), true);
  assert.equal(w.contains(nfp.time - 16 * MINUTE), false);
  assert.equal(w.contains(nfp.time + 16 * MINUTE), false);
});

test('only exact-precision events are eligible to gate the strategy', () => {
  const events = buildCalendar(Date.UTC(2019, 0, 1), Date.UTC(2019, 11, 31));
  const w = makeNewsWindow(events, { beforeMin: 15, afterMin: 15 });
  const approximate = events.filter((e) => e.precision === 'approximate');
  assert.ok(approximate.length > 0, 'the calendar should contain inferred dates too');
  assert.equal(w.count, events.filter((e) => e.precision === 'exact' && e.importance === 'high').length,
    'the default filter must exclude anything whose timestamp was inferred');
});

test('sessions partition the day without gaps or overlaps', () => {
  const seen = new Set();
  for (let h = 0; h < 24; h++) {
    const s = sessionOf(Date.UTC(2020, 0, 1, h));
    assert.ok(s, `hour ${h} has no session`);
    seen.add(s);
  }
  assert.deepEqual([...seen].sort(), ['ASIA', 'LATE', 'LONDON', 'NEWYORK', 'OVERLAP']);
});

test('ISO week keys roll over correctly across a year boundary', () => {
  assert.equal(utcWeekKey(Date.UTC(2019, 11, 30)), utcWeekKey(Date.UTC(2020, 0, 1)),
    '30 Dec 2019 and 1 Jan 2020 are the same ISO week');
});

test('pearson matches known values', () => {
  assert.ok(Math.abs(pearson([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-9);
  assert.ok(Math.abs(pearson([1, 2, 3, 4], [8, 6, 4, 2]) + 1) < 1e-9);
  assert.equal(pearson([1, 1, 1], [1, 2, 3]), null, 'zero variance has no correlation');
});

test('the R histogram counts every trade exactly once', () => {
  const trades = [{ rMultiple: -5 }, { rMultiple: 0 }, { rMultiple: 1.1 }, { rMultiple: 99 }];
  const bins = rHistogram(trades);
  assert.equal(bins.reduce((a, b) => a + b.count, 0), 4, 'outliers must be clamped into the end bins, not dropped');
});

test('the MAE/MFE study separates winners from losers', () => {
  const trades = [
    { rMultiple: 2, mae: 0.3, mfe: 2.5 },
    { rMultiple: -1, mae: 1, mfe: 0.4 },
    { rMultiple: 1, mae: 0.2, mfe: 1.6 },
  ];
  const s = maeMfeStudy(trades);
  assert.equal(s.winners.n, 2);
  assert.equal(s.losers.n, 1);
  assert.equal(s.mfeReach.find((x) => x.r === 1.5).pct, (2 / 3) * 100);
});
