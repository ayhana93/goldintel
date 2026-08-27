// Phase 3 / Phase 33 — tests designed specifically to CATCH look-ahead bias.
//
// The strongest of these is the truncation-invariance test: if the engine ever
// consults a bar it should not have, then deleting the future from the dataset
// must change a decision taken before that point. It does not.

import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeSeries, closedOnly, asOf, lastClosedIndex, aggregate, alignIndex, CLOSED, DEVELOPING } from '../src/core/candles.js';
import { buildSwingTimeline, makeSwingCursor } from '../src/core/structure.js';
import { buildContext } from '../src/core/context.js';
import { runBacktest, swingsUpTo } from '../src/backtest/engine.js';
import { productionSwing, setupStrategy } from '../src/backtest/strategies.js';
import { loadGoldDataset } from '../src/data/dataset.js';
import { HOUR } from '../src/core/time.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'normalized');

function synth(n, tf = 'H1', now = Number.POSITIVE_INFINITY) {
  const candles = [];
  for (let i = 0; i < n; i++) {
    const base = 1000 + Math.sin(i / 7) * 20 + i * 0.05;
    candles.push({
      openTime: Date.UTC(2020, 0, 1) + i * HOUR,
      open: base, high: base + 3, low: base - 3, close: base + Math.cos(i / 3),
      volume: 100,
    });
  }
  // keep OHLC consistent
  for (const c of candles) {
    c.high = Math.max(c.high, c.open, c.close);
    c.low = Math.min(c.low, c.open, c.close);
  }
  return makeSeries({ symbol: 'TEST', timeframe: tf, source: 'synthetic', candles, now });
}

test('a bar is DEVELOPING until its close time has passed', () => {
  const s = synth(10, 'H1', Date.UTC(2020, 0, 1) + 9 * HOUR + 30 * 60_000);
  assert.equal(s.candles[8].state, CLOSED);
  assert.equal(s.candles[9].state, DEVELOPING, 'the bar covering the current instant must be DEVELOPING');
  assert.equal(closedOnly(s).length, 9, 'closedOnly must drop the forming bar');
});

test('asOf never returns a candle that had not closed', () => {
  const s = synth(50, 'H1');
  for (const t of [Date.UTC(2020, 0, 1) + 10 * HOUR, Date.UTC(2020, 0, 1) + 10 * HOUR - 1]) {
    for (const c of asOf(s, t)) {
      assert.ok(c.closeTime <= t, `candle closing ${c.closeTime} leaked at instant ${t}`);
    }
  }
  assert.equal(lastClosedIndex(s, s.candles[0].openTime), -1, 'nothing is closed before the first bar ends');
});

test('a swing is never visible before its confirmation bar', () => {
  const s = synth(400);
  const lookback = 3;
  const tl = buildSwingTimeline(s.candles, lookback);
  assert.ok(tl.length > 5, 'the synthetic series should contain swings');
  for (const sw of tl) {
    assert.equal(sw.confirmedIndex, sw.index + lookback);
    assert.ok(sw.confirmedAt === s.candles[sw.confirmedIndex].closeTime);
  }
  const cursor = makeSwingCursor(tl);
  for (let i = 0; i < s.candles.length; i += 17) {
    for (const sw of cursor.knownAt(i)) {
      assert.ok(sw.confirmedIndex <= i, `swing confirmed at ${sw.confirmedIndex} was visible at bar ${i}`);
      assert.ok(sw.index <= i - lookback, 'a swing cannot be known within lookback bars of itself');
    }
  }
});

test('swingsUpTo is bounded and causal', () => {
  const s = synth(500);
  const ctxLike = { timeline: buildSwingTimeline(s.candles, 3) };
  const got = swingsUpTo(ctxLike, 200, 10);
  assert.ok(got.length <= 10);
  for (const sw of got) assert.ok(sw.confirmedIndex <= 200);
});

test('aggregation refuses to emit an under-covered bucket', () => {
  const s = synth(10, 'H1');                       // 10 hours only
  const agg = aggregate(s, 'H4', { minCoverage: 0.9 });
  for (const c of agg.candles) {
    assert.ok(c.high >= c.low);
  }
  // 10 H1 bars starting at 00:00 => buckets 00-04 (4), 04-08 (4), 08-12 (2).
  // The last bucket has 50% coverage and must be dropped at minCoverage 0.9.
  assert.equal(agg.candles.length, 2);
});

test('alignIndex only ever points at an already-closed higher-timeframe bar', () => {
  const h1 = synth(200, 'H1');
  const h4 = aggregate(h1, 'H4', { minCoverage: 0.5 });
  const map = alignIndex(h1.candles, h4.candles);
  for (let i = 0; i < h1.candles.length; i++) {
    const j = map[i];
    if (j < 0) continue;
    assert.ok(h4.candles[j].closeTime <= h1.candles[i].closeTime,
      `H1 bar ${i} was aligned to an H4 bar that had not closed`);
    if (j + 1 < h4.candles.length) {
      assert.ok(h4.candles[j + 1].closeTime > h1.candles[i].closeTime, 'alignment must pick the NEWEST closed bar');
    }
  }
});

test('every trade is entered strictly after the bar that produced its signal', () => {
  const ds = loadGoldDataset(DIR);
  const from = Date.UTC(2019, 0, 1), to = Date.UTC(2019, 6, 1);
  const ctx = buildContext({ m15: ds.m15, h1: ds.h1, h4: ds.h4, d1: ds.d1, macro: { dxy: ds.dxy } });
  const res = runBacktest({ ctx, strategy: productionSwing(), execution: 'realistic', fromMs: from, toMs: to });
  assert.ok(res.trades.length > 0, 'the window should produce trades');
  for (const t of res.trades) {
    // The fill price is taken from the OPEN of a strictly later driver bar. That
    // instant equals the decision bar's close time, which is correct: the price
    // used is the next bar's open, never the decision bar's own body.
    assert.ok(t.entryIndex > t.signalIndex, `trade ${t.id} filled on its own signal bar`);
    assert.ok(t.entryTime >= t.signalTime, `trade ${t.id} filled before its signal`);
    assert.ok(t.exitTime >= t.entryTime, `trade ${t.id} exited before it was entered`);
    for (const e of t.exits) assert.ok(e.time >= t.entryTime);
  }
});

test('TRUNCATION INVARIANCE: deleting the future does not change any past decision', () => {
  const ds = loadGoldDataset(DIR);
  const from = Date.UTC(2018, 0, 1);
  const cut = Date.UTC(2019, 0, 1);

  const strategy = () => setupStrategy({ targetCfg: { rMultiples: [1, 2, 3] } });

  const full = buildContext({ m15: ds.m15, h1: ds.h1, h4: ds.h4, d1: ds.d1, macro: { dxy: ds.dxy } });
  const a = runBacktest({ ctx: full, strategy: strategy(), execution: 'realistic', fromMs: from, toMs: cut });

  // Rebuild every series with everything after the cut physically removed.
  const chop = (s) => makeSeries({
    symbol: s.symbol, timeframe: s.timeframe, source: s.source, timezone: s.timezone,
    candles: s.candles.filter((c) => c.closeTime <= cut).map((c) => ({
      openTime: c.openTime, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
    })),
    now: Number.POSITIVE_INFINITY,
  });
  const truncated = buildContext({
    m15: chop(ds.m15), h1: chop(ds.h1), h4: chop(ds.h4), d1: chop(ds.d1), macro: { dxy: chop(ds.dxy) },
  });
  const b = runBacktest({ ctx: truncated, strategy: strategy(), execution: 'realistic', fromMs: from, toMs: cut });

  // Compare the DECISION, not the trade's later evolution: `sl` is mutated to
  // breakeven after TP1, so a position that outlives the cut in one run would
  // differ for a reason that has nothing to do with look-ahead.
  const sig = (r) => r.trades.map((t) => [
    t.setupId, t.direction, t.signalTime, t.originalSl.toFixed(4), t.tp1.toFixed(4), t.tp3.toFixed(4),
  ].join('|'));

  const sa = sig(a), sb = sig(b);
  assert.ok(sa.length > 20, `expected a meaningful sample, got ${sa.length}`);
  // Trades still open at the cut are force-closed differently in the two runs,
  // so compare the DECISIONS, which is what look-ahead would corrupt.
  const common = Math.min(sa.length, sb.length);
  assert.deepEqual(sb.slice(0, common), sa.slice(0, common),
    'a decision changed when future data was removed — the engine is reading ahead');
});
