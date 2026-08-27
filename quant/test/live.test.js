// The live application's own engine, tested directly. These modules are plain
// JavaScript in .ts files (Base44 functions), so Node imports them as-is.

import test from 'node:test';
import assert from 'node:assert/strict';
import { markCandleStates, closedCandles, developingCandle, aggregateH4, TF_MS } from '../../base44/shared/marketFeed.ts';
import { analyze, buildPlan, classifyRegime } from '../../base44/shared/signalEngine.ts';
import { resolvePaperTrade, positionSize, entryFill } from '../../base44/shared/paperExecution.ts';
import { buildCalendar, newsRiskAt, sessionOf } from '../../base44/shared/calendar.ts';
import { EDGE_STATS } from '../../base44/shared/edgeStats.ts';
import { defaultModeFor } from '../../base44/shared/tradingMode.ts';
import { SETUP_IDS } from '../src/core/setups.js';

const HOUR = 3_600_000;
const start = Date.UTC(2021, 5, 1);

/**
 * Build a series whose LAST bar is the one currently forming at `now`, so every
 * timeframe covers the same wall-clock window. Anchoring them all at a shared
 * start instead would leave the daily series with a handful of closed bars while
 * the M15 series had hundreds.
 */
function series(tf, n, fn, now = start + 400 * HOUR - 60_000) {
  const step = TF_MS[tf];
  const end = Math.floor(now / step) * step;    // open time of the forming bar
  const raw = [];
  for (let i = 0; i < n; i++) {
    const c = fn(i);
    raw.push({
      openTime: end - (n - 1 - i) * step,
      open: c.o, high: Math.max(c.o, c.h, c.c), low: Math.min(c.o, c.l, c.c), close: c.c, volume: 100,
    });
  }
  const candles = markCandleStates(raw, tf, now);
  const lastClosed = [...candles].reverse().find((c) => c.closed) ?? null;
  return { status: 'ok', source: 'test', symbol: 'TEST', timeframe: tf, timezone: 'UTC',
           fetchedAt: now, candles, meta: { price: raw[raw.length - 1].close, previousClose: null },
           lastClosedTime: lastClosed?.closeTime ?? null, stalenessBars: 0 };
}

/** A market that trends up on every timeframe, which should light up the long setups. */
function bullDataset(now) {
  const up = (slope) => (i) => {
    const base = 1800 + i * slope;
    return { o: base, h: base + slope * 1.2, l: base - slope * 0.8, c: base + slope * 0.9 };
  };
  const m15 = series('M15', 900, up(0.05), now);
  const h1 = series('H1', 400, up(0.2), now);
  return {
    gold: {
      status: 'ok', source: 'test', symbol: 'TEST', timezone: 'UTC',
      referencePrice: null, livePrice: 2000, previousClose: 1990, fetchedAt: now,
      timeframes: {
        M5: series('M5', 900, up(0.02), now),
        M15: m15,
        H1: h1,
        H4: series('H4', 300, up(0.8), now),
        D1: series('D1', 300, up(4), now),
      },
    },
    dxy: series('D1', 100, (i) => ({ o: 95 - i * 0.02, h: 95 - i * 0.02, l: 95 - i * 0.02, c: 95 - i * 0.02 }), now),
    us10y: null,
    fetchedAt: now,
  };
}

test('a candle is DEVELOPING until its close time passes, and closedCandles drops it', () => {
  const now = start + 10 * HOUR - 60_000;   // one minute before the newest bar closes
  const s = series('H1', 10, (i) => ({ o: 100 + i, h: 101 + i, l: 99 + i, c: 100.5 + i }), now);
  assert.equal(s.candles[8].closed, true);
  assert.equal(s.candles[9].closed, false, 'the bar covering the current instant is still forming');
  assert.equal(closedCandles(s).length, 9);
  assert.equal(developingCandle(s).openTime, s.candles[9].openTime);
});

test('H4 aggregation refuses to ship an under-covered bucket', () => {
  // Anchored at a 4-hour boundary so the bucket arithmetic is easy to reason about.
  const anchored = (n) => {
    const raw = Array.from({ length: n }, (_, i) => ({
      openTime: start + i * HOUR, open: 100 + i, high: 101 + i, low: 99 + i, close: 100.5 + i, volume: 1,
    }));
    return { status: 'ok', source: 'test', symbol: 'T', timeframe: 'H1', timezone: 'UTC',
             fetchedAt: start + n * HOUR + 1, candles: markCandleStates(raw, 'H1', start + n * HOUR + 1),
             meta: {}, lastClosedTime: null, stalenessBars: 0 };
  };
  const h1 = anchored(6);
  const h4 = aggregateH4(h1, start + 6 * HOUR + 1);
  // 6 hourly bars from 00:00 fill the 00-04 bucket (4 bars) and start 04-08 (2 bars).
  assert.equal(h4.candles.length, 2);
  assert.equal(h4.candles[0].high, Math.max(...h1.candles.slice(0, 4).map((c) => c.high)));
  assert.equal(h4.candles[0].low, Math.min(...h1.candles.slice(0, 4).map((c) => c.low)));

  const one = anchored(5);
  assert.equal(aggregateH4(one, start + 5 * HOUR + 1).candles.length, 1,
    'a single leftover hour must not become a 4-hour candle');
});

test('analyze runs on closed candles and never reports the forming bar as its reference', () => {
  const now = start + 400 * HOUR - 60_000;
  const a = analyze(bullDataset(now), { now });
  assert.equal(a.available, true, a.reason);
  assert.equal(a.dataQuality.referenceBarState, 'CLOSED');
  assert.ok(a.dataQuality.referenceTime <= now, 'the reference bar must already have closed');
  assert.ok(a.dataQuality.developingBarOpenTime > a.dataQuality.referenceTime - HOUR,
    'the forming bar is reported separately, not folded into the analysis');
});

test('the evidence score is a 100-point split and is never called a probability', () => {
  const now = start + 400 * HOUR - 60_000;
  const a = analyze(bullDataset(now), { now });
  assert.equal(a.evidence.longScore + a.evidence.shortScore, 100,
    'long and short partition the same 100 points, which is why the number is not a probability');
  assert.equal(a.evidence.directionalEdge, a.evidence.longScore - a.evidence.shortScore);
  assert.ok(a.evidence.longScore >= 50, 'a market rising on every timeframe should read bullish');
  assert.equal(a.confidence, undefined, 'the misleading "confidence" field is gone');
});

test('the live engine detects the same setups the backtester measured', () => {
  const now = start + 400 * HOUR - 60_000;
  const a = analyze(bullDataset(now), { now });
  for (const s of a.setups) {
    assert.ok(SETUP_IDS.includes(s.id), `${s.id} is not one of the measured setups`);
    assert.ok(['A+', 'A', 'B', 'C', 'NO_TRADE'].includes(s.tier));
  }
  assert.ok(a.setups.length > 0, 'a clean uptrend should satisfy at least one long setup');
});

test('a setup rated NO_TRADE is never promoted to the primary signal', () => {
  const now = start + 400 * HOUR - 60_000;
  const a = analyze(bullDataset(now), { now });
  if (a.primary) assert.notEqual(a.primary.tier, 'NO_TRADE');
  const tradable = a.setups.filter((s) => s.tier !== 'NO_TRADE');
  if (tradable.length === 0) assert.equal(a.primary, null, 'nothing tradable means NO TRADE, not "best of a bad lot"');
});

test('every reported statistic belongs to the setup and carries its sample size', () => {
  const now = start + 400 * HOUR - 60_000;
  const a = analyze(bullDataset(now), { now });
  for (const s of a.setups) {
    if (!s.history?.outOfSample) continue;
    assert.equal(typeof s.history.outOfSample.trades, 'number');
    assert.ok(s.history.outOfSample.trades >= 0);
    assert.equal(s.expectedValueR, s.history.outOfSample.expectancy,
      'expected value must be the measured expectancy, not a fresh guess');
  }
});

test('analyze refuses to produce anything from unavailable data', () => {
  assert.equal(analyze({ gold: { status: 'unavailable' } }).available, false);
  assert.equal(analyze(null).available, false);
  assert.equal(analyze({ gold: { status: 'ok', timeframes: {} } }).available, false);
});

test('buildPlan puts targets at honest R multiples with no 5R floor', () => {
  const p = buildPlan({ price: 2000, direction: 'LONG', atr: 10, levels: { supports: [], resistances: [] }, swingLow: 1985 });
  assert.ok(p.sl < 2000 && p.risk > 0);
  assert.ok(Math.abs((p.tp1 - 2000) / p.risk - 1) < 1e-9, 'TP1 is 1R');
  assert.ok(Math.abs((p.tp2 - 2000) / p.risk - 2) < 1e-9, 'TP2 is 2R');
  assert.ok(Math.abs((p.tp3 - 2000) / p.risk - 3) < 1e-9, 'TP3 is 3R, not a 5R floor');

  const short = buildPlan({ price: 2000, direction: 'SHORT', atr: 10, levels: { supports: [], resistances: [] }, swingHigh: 2015 });
  assert.ok(short.sl > 2000 && short.tp1 < 2000 && short.tp3 < short.tp1);
});

test('the stop is capped so a distant swing cannot blow up the risk', () => {
  const near = buildPlan({ price: 2000, direction: 'LONG', atr: 10, levels: { supports: [], resistances: [] }, swingLow: 1995 });
  const far = buildPlan({ price: 2000, direction: 'LONG', atr: 10, levels: { supports: [], resistances: [] }, swingLow: 1500 });
  assert.ok(far.risk <= 2.5 * 10 + 1e-9, `risk ${far.risk} exceeded the 2.5 ATR cap`);
  assert.ok(near.risk >= 0.6 * 10 - 1e-9, 'a very close swing must still leave a minimum stop');
});

test('regime separates the two pullback directions and reports volatility separately', () => {
  assert.equal(classifyRegime({ d1: 'bullish', h4: 'bullish', h1: 'bullish', volRatio: 1 }).regime, 'TRENDING_BULLISH');
  assert.equal(classifyRegime({ d1: 'bullish', h4: 'bullish', h1: 'bearish', volRatio: 1 }).regime, 'PULLBACK_BULLISH');
  assert.equal(classifyRegime({ d1: 'bearish', h4: 'bearish', h1: 'bullish', volRatio: 1 }).regime, 'PULLBACK_BEARISH');
  // Volatility no longer overwrites a clear trend, as the original classifier did.
  const hotTrend = classifyRegime({ d1: 'bullish', h4: 'bullish', h1: 'bullish', volRatio: 3 });
  assert.equal(hotTrend.regime, 'TRENDING_BULLISH');
  assert.equal(hotTrend.volState, 'HIGH');
});

test('paper position size comes from the stop distance', () => {
  const s = positionSize({ accountSize: 10000, riskPct: 1, entry: 2000, stop: 1990 });
  assert.equal(s.riskAmount, 100);
  assert.equal(s.units, 10);
  assert.equal(positionSize({ accountSize: 10000, riskPct: 1, entry: 2000, stop: 2000 }).units, 0);
});

test('a paper trade that reaches TP1 then reverses is closed at breakeven, not at the original stop', () => {
  const entry = entryFill(2000, 'LONG');
  const trade = {
    direction: 'LONG', entry_price: entry, risk_price: 10, units: 10, risk_amount: 100,
    stop_loss: entry - 10, tp1: entry + 10, tp2: entry + 20, tp3: entry + 30,
    tp1_hit: false, tp2_hit: false, tp3_hit: false, realized_pnl: 0, mae_r: 0, mfe_r: 0,
  };
  const bar = (h, l) => ({ openTime: 0, closeTime: HOUR, open: entry, high: h, low: l, close: entry, volume: 0 });
  const res = resolvePaperTrade(trade, [
    bar(entry + 12, entry - 1),    // reaches TP1, stop moves to entry
    bar(entry + 1, entry - 30),    // collapses; the breakeven stop closes the rest
  ]);
  assert.equal(res.tp1Hit, true);
  assert.equal(res.closed, true);
  assert.equal(res.exitReason, 'STOP_AFTER_TP1');
  assert.ok(res.realizedR > 0.2, `half the position banked 1R, so the trade should be net positive, got ${res.realizedR}`);
});

test('a paper trade stopped out loses close to exactly 1R, never more than costs justify', () => {
  const entry = entryFill(2000, 'LONG');
  const trade = {
    direction: 'LONG', entry_price: entry, risk_price: 10, units: 10, risk_amount: 100,
    stop_loss: entry - 10, tp1: entry + 10, tp2: entry + 20, tp3: entry + 30,
    tp1_hit: false, tp2_hit: false, tp3_hit: false, realized_pnl: 0, mae_r: 0, mfe_r: 0,
  };
  const res = resolvePaperTrade(trade, [
    { openTime: 0, closeTime: HOUR, open: entry, high: entry + 1, low: entry - 30, close: entry - 25, volume: 0 },
  ]);
  assert.equal(res.exitReason, 'STOP');
  assert.ok(res.realizedR < -1 && res.realizedR > -1.3,
    `a stop-out should cost about 1R plus slippage and commission, got ${res.realizedR}R`);
  assert.ok(res.mae >= 1);
});

test('MAE and MFE are recorded even while a trade is still open', () => {
  const entry = entryFill(2000, 'LONG');
  const trade = {
    direction: 'LONG', entry_price: entry, risk_price: 10, units: 10, risk_amount: 100,
    stop_loss: entry - 10, tp1: entry + 50, tp2: entry + 60, tp3: entry + 70,
    tp1_hit: false, tp2_hit: false, tp3_hit: false, realized_pnl: 0, mae_r: 0, mfe_r: 0,
  };
  const res = resolvePaperTrade(trade, [
    { openTime: 0, closeTime: HOUR, open: entry, high: entry + 5, low: entry - 5, close: entry, volume: 0 },
  ]);
  assert.equal(res.closed, false);
  assert.ok(Math.abs(res.mfe - 0.5) < 1e-9);
  assert.ok(Math.abs(res.mae - 0.5) < 1e-9);
});

test('news risk rises near a high-impact release', () => {
  const events = buildCalendar(Date.UTC(2021, 0, 1), Date.UTC(2021, 11, 31));
  const nfp = events.find((e) => e.name === 'Non-Farm Payrolls');
  assert.equal(newsRiskAt(events, nfp.time).level, 'HIGH');
  assert.equal(sessionOf(Date.UTC(2021, 0, 1, 13)), 'OVERLAP');
});

test('the scalp tier is disabled, and the reason is recorded with the numbers behind it', () => {
  assert.equal(EDGE_STATS.gating.scalpEnabled, false);
  assert.match(EDGE_STATS.gating.scalpReason, /-0\.\d+R/, 'the reason must quote the measured expectancy');
  assert.equal(EDGE_STATS.measured.strategies.BASELINE_SCALP.tier, 'NO_TRADE');
  assert.ok(EDGE_STATS.measured.strategies.BASELINE_SCALP.outOfSample.expectancy < -0.2);
});

test('the presentation default is derived from the verdict rather than hardcoded', () => {
  // This used to assert a constant `true`, which is exactly what the flag was: a
  // hardcoded value in a generated file. Now it must follow the rule.
  const expected = EDGE_STATS.verdict === 'PROVEN EDGE' ? 'ADVISORY' : 'PAPER';
  assert.equal(EDGE_STATS.gating.defaultMode, expected);
  assert.equal(EDGE_STATS.gating.emitLiveSignals, expected === 'ADVISORY');
  assert.equal(EDGE_STATS.gating.paperTradingOnly, expected === 'PAPER');
  assert.equal(defaultModeFor(EDGE_STATS), EDGE_STATS.gating.defaultMode,
    'the generated file and the rule the live code applies must agree');
  assert.ok(['PROVEN EDGE', 'POSSIBLE EDGE', 'NO EDGE', 'OVERFIT', 'UNKNOWN'].includes(EDGE_STATS.verdict));
});

test('every measured setup carries an out-of-sample record and a tier derived from it', () => {
  for (const id of SETUP_IDS) {
    const s = EDGE_STATS.measured.setups[id];
    assert.ok(s, `${id} has no measured statistics`);
    assert.ok(s.outOfSample, `${id} has no out-of-sample record`);
    assert.ok(['A+', 'A', 'B', 'C', 'NO_TRADE'].includes(s.tier));
    if (s.tier !== 'NO_TRADE') {
      assert.ok(s.outOfSample.expectancy >= 0,
        `${id} is rated ${s.tier} despite a negative out-of-sample expectancy`);
      assert.ok(s.outOfSample.trades >= 30, `${id} is rated ${s.tier} on only ${s.outOfSample.trades} trades`);
    }
  }
});
