// Execution, risk and level-policy behaviour. These are the rules that decide
// whether a backtest is a measurement or a drawing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeExecutionModel, SCENARIOS } from '../src/core/execution.js';
import { positionSize, makeRiskEngine } from '../src/core/risk.js';
import { buildPlan, STOP_POLICIES, TARGET_POLICIES } from '../src/core/levels.js';
import { HOUR } from '../src/core/time.js';

const bar = (o, h, l, c) => ({ openTime: 0, closeTime: HOUR, open: o, high: h, low: l, close: c, volume: 0 });

test('a buyer pays the ask and a seller receives the bid', () => {
  const x = makeExecutionModel('realistic');
  const half = x.cfg.spread / 2;
  assert.equal(x.entryFill(2000, 'LONG'), 2000 + half + x.cfg.slippage);
  assert.equal(x.entryFill(2000, 'SHORT'), 2000 - half - x.cfg.slippage);
  assert.equal(x.exitFill(2000, 'LONG'), 2000 - half - x.cfg.slippage);
  assert.equal(x.exitFill(2000, 'SHORT'), 2000 + half + x.cfg.slippage);
});

test('costs make a round trip strictly worse than a frictionless one', () => {
  for (const name of ['optimistic', 'realistic', 'conservative']) {
    const x = makeExecutionModel(name);
    const in_ = x.entryFill(2000, 'LONG');
    const out = x.exitFill(2000, 'LONG');
    assert.ok(out < in_, `${name}: entering and exiting at the same mid should lose money`);
  }
  const zero = makeExecutionModel('zero');
  assert.equal(zero.entryFill(2000, 'LONG'), zero.exitFill(2000, 'LONG'));
});

test('a long stop triggers before the mid reaches it, because the bid gets there first', () => {
  const x = makeExecutionModel('realistic');
  const half = x.cfg.spread / 2;
  const sl = 1990;
  assert.equal(x.stopHit(bar(2000, 2001, sl + half + 0.01, 2000), 'LONG', sl), null,
    'the bid has not reached the stop yet');
  const fill = x.stopHit(bar(2000, 2001, sl + half, 2000), 'LONG', sl);
  assert.equal(fill, sl - x.cfg.slippage, 'a stop fills through the level, not at it');
});

test('a target needs the mid to travel further than the target itself', () => {
  const x = makeExecutionModel('realistic');
  const half = x.cfg.spread / 2;
  const tp = 2010;
  assert.equal(x.targetHit(bar(2000, tp, 1999, 2005), 'LONG', tp), null,
    'the mid touching the target is not enough: the bid must reach it');
  assert.equal(x.targetHit(bar(2000, tp + half, 1999, 2005), 'LONG', tp), tp,
    'a limit order fills at its limit, with no slippage');
});

test('news widens the spread, which moves both triggers against the position', () => {
  const x = makeExecutionModel('realistic');
  const normal = x.entryFill(2000, 'LONG', false);
  const inNews = x.entryFill(2000, 'LONG', true);
  assert.ok(inNews > normal, 'entering during a release should cost more');
  const sl = 1990;
  assert.equal(x.stopHit(bar(2000, 2001, 1990.2, 2000), 'LONG', sl, false), null);
  assert.ok(x.stopHit(bar(2000, 2001, 1990.2, 2000), 'LONG', sl, true) != null,
    'a wider spread stops the position out sooner');
});

test('position size comes from the stop distance and ignores everything else', () => {
  const a = positionSize({ equity: 10000, riskPct: 1, entry: 2000, stop: 1990 });
  assert.equal(a.riskAmount, 100);
  assert.equal(a.units, 10, '100 dollars of risk over a 10 dollar stop is 10 ounces');

  const wider = positionSize({ equity: 10000, riskPct: 1, entry: 2000, stop: 1980 });
  assert.equal(wider.units, 5, 'twice the stop distance must be half the size');

  assert.equal(positionSize({ equity: 10000, riskPct: 1, entry: 2000, stop: 2000 }).units, 0,
    'a zero-width stop must not produce an infinite position');
});

test('the daily kill switch stops new trades and resets the next day', () => {
  const r = makeRiskEngine({ accountSize: 10000, maxDailyLossPct: 3, maxConcurrentTrades: 10, maxConsecutiveLosses: 99 });
  const day1 = Date.UTC(2020, 0, 1, 10);
  assert.equal(r.canOpen(day1).ok, true);
  r.opened(); r.record(day1, -310);
  assert.equal(r.canOpen(day1).reason, 'DAILY_KILL_SWITCH');
  assert.equal(r.canOpen(Date.UTC(2020, 0, 2, 10)).ok, true, 'the limit is daily, not permanent');
});

test('the weekly kill switch outlives a day roll', () => {
  const r = makeRiskEngine({ accountSize: 10000, maxDailyLossPct: 100, maxWeeklyLossPct: 6, maxConcurrentTrades: 10, maxConsecutiveLosses: 99 });
  const mon = Date.UTC(2020, 0, 6, 10);
  r.opened(); r.record(mon, -610);
  assert.equal(r.canOpen(Date.UTC(2020, 0, 7, 10)).reason, 'WEEKLY_KILL_SWITCH');
  assert.equal(r.canOpen(Date.UTC(2020, 0, 13, 10)).ok, true, 'the next week starts clean');
});

test('concurrency is capped and consecutive losses trigger a cooldown', () => {
  const r = makeRiskEngine({ accountSize: 10000, maxConcurrentTrades: 2, maxConsecutiveLosses: 3, cooldownHours: 24, maxDailyLossPct: 100, maxWeeklyLossPct: 100 });
  const t = Date.UTC(2020, 0, 1, 10);
  r.opened(); r.opened();
  assert.equal(r.canOpen(t).reason, 'MAX_CONCURRENT');
  r.record(t, -10); r.record(t, -10);
  r.opened(); r.record(t, -10);
  assert.equal(r.canOpen(t).reason, 'LOSS_COOLDOWN', 'three losses in a row should pause trading');
  assert.equal(r.canOpen(t + 25 * HOUR).ok, true, 'the cooldown expires');
});

test('a winning trade clears the consecutive-loss counter', () => {
  const r = makeRiskEngine({ accountSize: 10000, maxConsecutiveLosses: 3, maxConcurrentTrades: 10, maxDailyLossPct: 100, maxWeeklyLossPct: 100 });
  const t = Date.UTC(2020, 0, 1, 10);
  r.opened(); r.record(t, -10);
  r.opened(); r.record(t, -10);
  r.opened(); r.record(t, +10);
  r.opened(); r.record(t, -10);
  assert.equal(r.canOpen(t).ok, true, 'the streak was broken by the winner');
});

test('every stop policy puts the stop on the losing side of the entry', () => {
  const args = { price: 2000, atr: 10, volRatio: 1, swingLow: 1985, swingHigh: 2015, cfg: {} };
  for (const [name, fn] of Object.entries(STOP_POLICIES)) {
    assert.ok(fn({ ...args, direction: 'LONG' }) < 2000, `${name}: a long stop must sit below the entry`);
    assert.ok(fn({ ...args, direction: 'SHORT' }) > 2000, `${name}: a short stop must sit above the entry`);
  }
});

test('the reproduced production stop always takes the wider of its two candidates', () => {
  // Documented in the audit as S2-4: Math.min on a long stop selects the LOWER
  // price, so a distant swing widens risk without bound.
  const near = STOP_POLICIES.production({ price: 2000, direction: 'LONG', atr: 10, swingLow: 1999 });
  const far = STOP_POLICIES.production({ price: 2000, direction: 'LONG', atr: 10, swingLow: 1900 });
  assert.ok(far < near, 'a further swing low must produce a wider stop, as the original did');
  assert.ok(2000 - near >= 10, 'risk is at least one ATR even when the swing is close');
});

test('the reproduced production target floors TP3 at 5R', () => {
  const tps = TARGET_POLICIES.production({
    price: 2000, direction: 'LONG', risk: 10,
    levels: { resistances: [{ price: 2005 }], supports: [] },
  });
  assert.ok(tps[2] >= 2000 + 5 * 10, 'TP3 must be floored at 5R, which is what inflated the advertised R:R');
});

test('buildPlan orders targets in the direction of the trade and reports honest R', () => {
  const long = buildPlan({
    price: 2000, direction: 'LONG', atr: 10, volRatio: 1, swingLow: 1985, swingHigh: 2015,
    levels: { supports: [], resistances: [] }, stopPolicy: 'atr', targetPolicy: 'fixedR',
    stopCfg: { atrMult: 1 }, targetCfg: { rMultiples: [1, 2, 3] },
  });
  assert.equal(long.risk, 10);
  assert.ok(long.tp1 < long.tp2 && long.tp2 < long.tp3);
  assert.ok(Math.abs(long.rr1 - 1) < 1e-9, 'rr1 must be measured to TP1, not to TP3');

  const short = buildPlan({
    price: 2000, direction: 'SHORT', atr: 10, volRatio: 1, swingLow: 1985, swingHigh: 2015,
    levels: { supports: [], resistances: [] }, stopPolicy: 'atr', targetPolicy: 'fixedR',
    stopCfg: { atrMult: 1 }, targetCfg: { rMultiples: [1, 2, 3] },
  });
  assert.ok(short.tp1 > short.tp2 && short.tp2 > short.tp3);
});

test('cost scenarios are ordered from cheapest to most expensive', () => {
  const cost = (n) => SCENARIOS[n].spread + SCENARIOS[n].slippage + SCENARIOS[n].commissionPerUnit;
  assert.ok(cost('zero') < cost('optimistic'));
  assert.ok(cost('optimistic') < cost('realistic'));
  assert.ok(cost('realistic') < cost('conservative'));
  for (const s of Object.values(SCENARIOS)) {
    assert.ok(s.entryDelayBars >= 1, 'a fill may never happen on the decision bar itself');
  }
});
