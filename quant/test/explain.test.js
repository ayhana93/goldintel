// The explanation layer is the only part of the system most users will ever
// read, so what it is allowed to claim is tested as carefully as the maths.
//
// Two failure modes matter more than the wording: saying "open a position" when
// nothing qualified, and dressing a historical hit rate up as the probability of
// the trade in front of you.

import test from 'node:test';
import assert from 'node:assert/strict';
import { explain, explainOutcome } from '../../base44/shared/explain.ts';

const analysis = (over = {}) => ({
  available: true,
  verdict: 'POSSIBLE EDGE',
  regime: 'TRENDING_BULLISH',
  volState: 'NORMAL',
  conflict: 'LOW',
  newsRisk: { level: 'LOW' },
  setups: [],
  gateSummary: { blocked: [] },
  breakdown: {
    trend: { long: 25, short: 0, max: 25 },
    structure: { long: 20, short: 5, max: 25 },
    momentum: { long: 3, short: 9, max: 12 },
    support_resistance: { long: 6, short: 7, max: 13 },
    price_action: { long: 5, short: 5, max: 10 },
    macro: { long: 4, short: 11, max: 15 },
  },
  ...over,
});

const setup = (over = {}) => ({
  id: 'A_TREND_CONT_LONG',
  name: 'Trend Continuation Long',
  direction: 'LONG',
  plan: { entry: 2000, sl: 1985, tp1: 2015, tp2: 2030, tp3: 2045 },
  history: { outOfSample: { trades: 490, winRate: 41.2, expectancy: 0.0722, profitFactor: 1.148 } },
  gate: { provenBy: { key: 'BASELINE_SWING_LONG_ONLY', trades: 355, expectancy: 0.171 } },
  ...over,
});

test('with no qualifying setup it says wait, and never says open', () => {
  const b = explain(analysis(), null);
  assert.equal(b.action, 'ИЗЧАКАЙ');
  assert.doesNotMatch(b.action, /ОТВОРИ/);
  assert.ok(b.why.length > 0, 'a refusal without a reason is what made the old card useless');
});

test('a refusal names the gate that shut, not just "no"', () => {
  const b = explain(analysis({
    setups: [{ id: 'A_TREND_CONT_LONG' }],
    gateSummary: { blocked: [{ id: 'A_TREND_CONT_LONG', blockedBy: ['EVIDENCE_BELOW_THRESHOLD', 'NEWS_RISK'] }] },
  }), null);
  assert.equal(b.action, 'ИЗЧАКАЙ');
  const text = b.why.join(' ');
  assert.match(text, /доказателствата в момента са под прага/);
  assert.match(text, /предстои важна новина/);
});

test('an unknown blocking code still reaches the user rather than vanishing', () => {
  const b = explain(analysis({
    setups: [{ id: 'X' }],
    gateSummary: { blocked: [{ id: 'X', blockedBy: ['SOME_NEW_GATE'] }] },
  }), null);
  assert.match(b.why.join(' '), /SOME_NEW_GATE/);
});

test('a qualifying setup produces prices, a reason and an invalidation', () => {
  const b = explain(analysis(), setup());
  assert.equal(b.action, 'ОТВОРИ LONG');
  assert.ok(b.why.length >= 2);
  assert.match(b.invalidation, /1985\.0/);
  assert.match(b.invalidation, /под/);
});

test('the historical rate is never called a probability for this trade', () => {
  const b = explain(analysis(), setup());
  assert.match(b.history, /историческа честота/i);
  assert.match(b.history, /а не вероятност/i);
  assert.match(b.history, /490/, 'the sample size must travel with the rate');
});

test('the brief says the proof belongs to the portfolio, not the single setup', () => {
  const b = explain(analysis(), setup());
  assert.match(b.proofNote, /цялата стратегия/);
  assert.match(b.proofNote, /355/);
});

test('an unproven verdict is always named as a risk', () => {
  const b = explain(analysis({ verdict: 'POSSIBLE EDGE' }), setup());
  assert.ok(b.risks.some((r) => r.includes('POSSIBLE EDGE')));
});

test('the strongest evidence components are the ones explained', () => {
  // trend is 25/25 for long and structure 20/25; momentum and macro favour short
  // and must not be quoted as reasons to go long.
  const b = explain(analysis(), setup());
  const text = b.why.join(' ');
  assert.match(text, /вървят нагоре/, 'trend carried this and should be named');
  assert.doesNotMatch(text, /инерцията е на страната на купувачите/i,
    'momentum favoured the other side and must not be claimed as support');
});

test('missing data is reported as missing, not as no trade', () => {
  const b = explain({ available: false, reason: 'Market data unavailable' }, null);
  assert.equal(b.action, 'ИЗЧАКАЙ');
  assert.match(b.headline, /Няма данни/);
});

test('a loss is explained by what happened, not softened', () => {
  const o = explainOutcome({ exit_reason: 'SL', realized_r: -1, stop_loss: 1985, mfe_r: 0.2, mae_r: 1 });
  assert.equal(o.won, false);
  assert.match(o.headline, /Не се получи/);
  assert.match(o.why.join(' '), /1985/);
});

test('a loss that was winning first says so', () => {
  const o = explainOutcome({ exit_reason: 'SL', realized_r: -1, stop_loss: 1985, mfe_r: 1.4, mae_r: 1 });
  assert.match(o.why.join(' '), /в твоя полза/);
});

test('a win is reported with the worst point it passed through', () => {
  const o = explainOutcome({ exit_reason: 'TP2', realized_r: 1.75, mae_r: 0.6, mfe_r: 2.1 });
  assert.equal(o.won, true);
  assert.match(o.headline, /Получи се/);
  assert.match(o.why.join(' '), /0\.60R/);
});

test('a time exit is not dressed up as either', () => {
  const o = explainOutcome({ exit_reason: 'EXPIRED', realized_r: 0.05, mae_r: 0.4, mfe_r: 0.5 });
  assert.match(o.headline, /Нито се получи, нито се провали/);
});
