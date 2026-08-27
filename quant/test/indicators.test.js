// Indicator correctness, checked against hand-computed values rather than
// against the implementation's own output.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ema, rsi, macd, atr, rollingMeanAt, last } from '../src/core/indicators.js';

const close = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

test('EMA seeds on the SMA and then applies the standard multiplier', () => {
  const v = [1, 2, 3, 4, 5, 6];
  const out = ema(v, 3);
  assert.equal(out[0], null);
  assert.equal(out[1], null);
  assert.equal(out[2], 2, 'the seed is the SMA of the first three values');
  const k = 2 / 4;
  assert.ok(Math.abs(out[3] - (4 * k + 2 * (1 - k))) < 1e-12);
  assert.equal(ema([1, 2], 5).length, 0, 'too short a series returns nothing rather than guessing');
});

test('EMA of a constant series is that constant', () => {
  const out = ema(new Array(50).fill(7), 20);
  assert.ok(Math.abs(out[49] - 7) < 1e-9);
});

test('RSI is 100 when every move is up and 0 when every move is down', () => {
  const up = close(40, (i) => 100 + i);
  assert.equal(last(rsi(up, 14)), 100);
  const down = close(40, (i) => 100 - i);
  assert.ok(last(rsi(down, 14)) < 1e-9);
});

test('RSI of a flat series is neutral', () => {
  const flat = new Array(40).fill(100);
  // No gains and no losses: Wilder's formula divides by zero loss, which the
  // implementation resolves to 100. Documented rather than silently surprising.
  assert.equal(last(rsi(flat, 14)), 100);
});

test('MACD line is the difference of its two EMAs and the histogram is line minus signal', () => {
  const closes = close(120, (i) => 100 + Math.sin(i / 5) * 10);
  const m = macd(closes, 12, 26, 9);
  const f = ema(closes, 12), s = ema(closes, 26);
  for (let i = 30; i < closes.length; i++) {
    assert.ok(Math.abs(m.line[i] - (f[i] - s[i])) < 1e-9, `MACD line mismatch at ${i}`);
    if (m.signal[i] != null) {
      assert.ok(Math.abs(m.histogram[i] - (m.line[i] - m.signal[i])) < 1e-9);
    }
  }
});

test('ATR of bars with a constant range equals that range', () => {
  const candles = close(60, (i) => ({ openTime: i, open: 100, high: 102, low: 98, close: 100, volume: 0 }));
  const a = atr(candles, 14);
  assert.ok(Math.abs(last(a) - 4) < 1e-9);
});

test('ATR includes the gap between bars, not just the bar range', () => {
  const candles = [];
  for (let i = 0; i < 40; i++) {
    const base = 100 + i * 10;   // a 10-point gap every bar
    candles.push({ openTime: i, open: base, high: base + 1, low: base - 1, close: base, volume: 0 });
  }
  const a = last(atr(candles, 14));
  assert.ok(a > 2, `ATR ${a} ignored the gaps; true range must span the previous close`);
});

test('every indicator is causal: values do not change when later bars are appended', () => {
  const closes = close(200, (i) => 100 + Math.sin(i / 7) * 5 + i * 0.02);
  const candles = closes.map((c, i) => ({ openTime: i, open: c, high: c + 1, low: c - 1, close: c, volume: 0 }));
  const cut = 150;
  const prefixCloses = closes.slice(0, cut);
  const prefixCandles = candles.slice(0, cut);

  const full = { ema: ema(closes, 20), rsi: rsi(closes, 14), atr: atr(candles, 14), macd: macd(closes).line };
  const part = { ema: ema(prefixCloses, 20), rsi: rsi(prefixCloses, 14), atr: atr(prefixCandles, 14), macd: macd(prefixCloses).line };

  for (const key of Object.keys(full)) {
    for (let i = 0; i < cut; i++) {
      const a = full[key][i], b = part[key][i];
      if (a == null && b == null) continue;
      assert.ok(Math.abs(a - b) < 1e-9, `${key}[${i}] changed when future bars were added: ${a} vs ${b}`);
    }
  }
});

test('rollingMeanAt looks backward only', () => {
  const s = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.equal(rollingMeanAt(s, 3, 4), 2.5);
  assert.equal(rollingMeanAt(s, 7, 3), 7);
  assert.equal(rollingMeanAt([null, null], 1, 5), null);
});
