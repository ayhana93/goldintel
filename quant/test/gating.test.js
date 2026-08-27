// The gates are the last thing between research and a signal on someone's phone,
// so they get tested as carefully as the maths does.

import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGates, DEFAULT_GATES } from '../../base44/shared/gating.ts';
import { resolveMode, defaultModeFor, MODES } from '../../base44/shared/tradingMode.ts';
import { EDGE_STATS } from '../../base44/shared/edgeStats.ts';
import { benjaminiHochberg, bonferroni, screenSummary, expectedFalsePositives } from '../src/backtest/multipletesting.js';
import { SETUP_IDS } from '../src/core/setups.js';

/** A statistics document good enough to pass every gate, for negative testing. */
const goodStats = (over = {}) => ({
  gating: {
    paperTradingOnly: false,
    allowedDirections: ['LONG', 'SHORT'],
    thresholds: DEFAULT_GATES,
    ...over.gating,
  },
  measured: {
    setups: {
      GOOD: {
        state: 'ACTIVE',
        outOfSample: { trades: 400, expectancy: 0.2, profitFactor: 1.5, ci95: [0.05, 0.35] },
        ...over.setup,
      },
    },
  },
});
const ctx = (over = {}) => ({
  direction: 'LONG', evidenceScore: 80, regime: 'TRENDING_BULLISH',
  session: 'LONDON', newsRisk: 'LOW', atr: 10,
  plan: { entry: 2000, sl: 1985 }, ...over,
});

test('a fully qualified setup passes, and says why', () => {
  const g = evaluateGates({ setup: { id: 'GOOD' }, context: ctx(), stats: goodStats() });
  assert.equal(g.tradable, true, g.reasons.join('; '));
  assert.equal(g.blockedBy.length, 0);
  assert.match(g.reasons.join(' '), /Every market gate passed/);
});

test('the default is NO TRADE: any single failing gate blocks the signal', () => {
  const cases = {
    NO_MEASURED_HISTORY: { setup: { id: 'UNKNOWN_SETUP' } },
    INSUFFICIENT_SAMPLE: { stats: goodStats({ setup: { outOfSample: { trades: 10, expectancy: 0.2, profitFactor: 1.5, ci95: [0.05, 0.35] } } }) },
    EXPECTANCY_BELOW_MINIMUM: { stats: goodStats({ setup: { outOfSample: { trades: 400, expectancy: 0.001, profitFactor: 1.5, ci95: [0.05, 0.35] } } }) },
    PROFIT_FACTOR_BELOW_MINIMUM: { stats: goodStats({ setup: { outOfSample: { trades: 400, expectancy: 0.2, profitFactor: 1.0, ci95: [0.05, 0.35] } } }) },
    INTERVAL_INCLUDES_ZERO: { stats: goodStats({ setup: { outOfSample: { trades: 400, expectancy: 0.2, profitFactor: 1.5, ci95: [-0.01, 0.4] } } }) },
    DIRECTION_DISABLED: { stats: goodStats({ gating: { paperTradingOnly: false, allowedDirections: ['SHORT'], thresholds: DEFAULT_GATES } }) },
    EVIDENCE_BELOW_THRESHOLD: { context: ctx({ evidenceScore: 55 }) },
    NEWS_RISK: { context: ctx({ newsRisk: 'HIGH' }), stats: goodStats({ gating: { paperTradingOnly: false, allowedDirections: ['LONG'], thresholds: { ...DEFAULT_GATES, maxNewsRisk: 'MEDIUM' } } }) },
    STOP_TOO_TIGHT_FOR_COSTS: { context: ctx({ plan: { entry: 2000, sl: 1998 } }) },
    PAPER_TRADING_ONLY: { stats: goodStats({ gating: { paperTradingOnly: true, allowedDirections: ['LONG'], thresholds: DEFAULT_GATES } }) },
  };
  for (const [expected, over] of Object.entries(cases)) {
    const g = evaluateGates({
      setup: over.setup ?? { id: 'GOOD' },
      context: over.context ?? ctx(),
      stats: over.stats ?? goodStats(),
    });
    assert.equal(g.tradable, false, `${expected} should have blocked the signal`);
    assert.ok(g.blockedBy.includes(expected), `expected ${expected}, got ${g.blockedBy.join(', ')}`);
    assert.ok(g.reasons.length > 0, 'a blocked signal must explain itself');
  }
});

test('a quarantined setup is refused however strong the current evidence looks', () => {
  const stats = goodStats({ setup: { state: 'DISABLED_NEGATIVE_EDGE', stateReason: 'negative out of sample' } });
  const g = evaluateGates({ setup: { id: 'GOOD' }, context: ctx({ evidenceScore: 100 }), stats });
  assert.equal(g.tradable, false);
  assert.ok(g.blockedBy.includes('DISABLED_NEGATIVE_EDGE'));
});

test('a perfect evidence score cannot on its own make a setup tradable', () => {
  // Everything else marginal, score at maximum.
  const stats = goodStats({ setup: { outOfSample: { trades: 20, expectancy: -0.5, profitFactor: 0.4, ci95: [-0.9, -0.1] } } });
  const g = evaluateGates({ setup: { id: 'GOOD' }, context: ctx({ evidenceScore: 100 }), stats });
  assert.equal(g.tradable, false);
  assert.ok(g.blockedBy.length >= 3, 'the score must not compensate for a failed statistical bar');
});

test('the shipped statistics quarantine every short setup and the scalp tier', () => {
  for (const id of SETUP_IDS.filter((x) => x.endsWith('_SHORT'))) {
    assert.equal(EDGE_STATS.measured.setups[id].state, 'DISABLED_NEGATIVE_EDGE', `${id} should be quarantined`);
    assert.ok(EDGE_STATS.measured.setups[id].stateReason, `${id} must record why`);
  }
  assert.equal(EDGE_STATS.measured.strategies.BASELINE_SCALP.state, 'DISABLED_NEGATIVE_EDGE');
  assert.deepEqual(EDGE_STATS.gating.allowedDirections, ['LONG']);
  assert.equal(EDGE_STATS.gating.paperTradingOnly, EDGE_STATS.verdict !== 'PROVEN EDGE');
});

test('no quarantined setup can produce a tradable signal under the shipped statistics', () => {
  for (const id of SETUP_IDS) {
    const rec = EDGE_STATS.measured.setups[id];
    if (rec.state !== 'DISABLED_NEGATIVE_EDGE') continue;
    const g = evaluateGates({
      setup: { id },
      context: ctx({ direction: id.endsWith('_SHORT') ? 'SHORT' : 'LONG', evidenceScore: 95 }),
      stats: EDGE_STATS,
    });
    assert.equal(g.tradable, false, `${id} produced a tradable signal despite being quarantined`);
  }
});

test('every setup the statistics keep ACTIVE has a positive out-of-sample record', () => {
  for (const [id, rec] of Object.entries(EDGE_STATS.measured.setups)) {
    if (rec.state !== 'ACTIVE') continue;
    assert.ok(rec.outOfSample.expectancy > 0, `${id} is ACTIVE with expectancy ${rec.outOfSample.expectancy}`);
  }
});

test('Bonferroni scales with the number of hypotheses and never exceeds 1', () => {
  assert.equal(bonferroni(0.01, 1), 0.01);
  assert.ok(Math.abs(bonferroni(0.01, 8) - 0.08) < 1e-12);
  assert.equal(bonferroni(0.5, 100), 1, 'the adjusted p must be clamped');
});

test('Benjamini-Hochberg orders, is monotone, and is less brutal than Bonferroni', () => {
  const entries = [
    { key: 'a', p: 0.001 }, { key: 'b', p: 0.008 }, { key: 'c', p: 0.02 },
    { key: 'd', p: 0.2 }, { key: 'e', p: 0.7 },
  ];
  const out = benjaminiHochberg(entries, 0.05);
  assert.equal(out.length, 5);
  for (let i = 1; i < out.length; i++) {
    assert.ok(out[i].qValue >= out[i - 1].qValue - 1e-12, 'q values must be non-decreasing');
  }
  assert.equal(out[0].survivesFDR, true, 'the strongest result should survive');
  assert.equal(out[4].survivesFDR, false);
  // BH is more permissive than Bonferroni at the same alpha.
  assert.ok(out[1].qValue <= bonferroni(0.008, 5) + 1e-12);
});

test('a screen of pure noise reports no excess over chance', () => {
  // 100 hypotheses with uniformly distributed p values: about 5 will look
  // significant at 0.05, and none should survive FDR control.
  const noise = Array.from({ length: 100 }, (_, i) => ({ key: `n${i}`, p: (i + 0.5) / 100 }));
  const s = screenSummary(noise, 0.05);
  assert.equal(s.hypotheses, 100);
  assert.ok(Math.abs(s.nominalDiscoveries - s.expectedByChance) <= 2,
    `noise produced ${s.nominalDiscoveries} discoveries against ${s.expectedByChance} expected`);
  assert.equal(s.survivingFDR.length, 0, 'nothing in pure noise may survive FDR control');
  assert.equal(expectedFalsePositives(100, 0.05), 5);
});

test('the committed screen result is reported honestly', () => {
  const s = EDGE_STATS.multipleTesting;
  if (!s) return;
  assert.ok(s.hypotheses > 0);
  assert.ok(s.expectedByChance >= 0);
  // Whatever the outcome, the record must show what chance alone would produce.
  assert.equal(typeof s.excessOverChance, 'number');
});

test('the statistics carry a feed-uncertainty band, so no figure is quoted as exact', () => {
  assert.ok(EDGE_STATS.feedUncertaintyR > 0,
    'measurements from a single vendor must state how much a different vendor moves them');
});

// --- presentation mode -------------------------------------------------------
// The mode used to be a hardcoded `paperTradingOnly: true` with no switch, and it
// was folded into the same list as the statistical gates — so "NO TRADE" meant
// either "the evidence says no" or "the app is in paper mode" and the interface
// could not tell you which. These tests hold the two apart.

test('the mode default is earned by the evidence, not chosen', () => {
  assert.equal(defaultModeFor({ verdict: 'PROVEN EDGE' }), MODES.ADVISORY);
  for (const v of ['POSSIBLE EDGE', 'NO EDGE', 'OVERFIT', 'UNKNOWN', undefined]) {
    assert.equal(defaultModeFor({ verdict: v }), MODES.PAPER, `${v} must not earn advisory mode`);
  }
  assert.equal(defaultModeFor(null), MODES.PAPER, 'no statistics at all means paper');
});

test('an unset or nonsense setting falls back to the derived default', () => {
  const stats = { verdict: 'POSSIBLE EDGE' };
  for (const requested of [undefined, null, '', 'LIVE', 'paper', 42]) {
    const m = resolveMode(stats, requested);
    assert.equal(m.mode, MODES.PAPER);
    assert.equal(m.overridden, false, `${String(requested)} must not count as a deliberate override`);
  }
});

test('an owner override is honoured, and an override ahead of the evidence is labelled', () => {
  const weak = { verdict: 'POSSIBLE EDGE' };
  const ahead = resolveMode(weak, MODES.ADVISORY);
  assert.equal(ahead.mode, MODES.ADVISORY, 'the owner may override');
  assert.equal(ahead.overridden, true);
  assert.equal(ahead.aheadOfEvidence, true);
  assert.match(ahead.reason, /ahead of the evidence/);
  assert.match(ahead.reason, /POSSIBLE EDGE/, 'the notice must name the verdict it is running ahead of');

  // The other direction is an override too, but a conservative one.
  const behind = resolveMode({ verdict: 'PROVEN EDGE' }, MODES.PAPER);
  assert.equal(behind.mode, MODES.PAPER);
  assert.equal(behind.overridden, true);
  assert.equal(behind.aheadOfEvidence, false, 'choosing caution is never ahead of the evidence');
});

test('no mode connects a broker', () => {
  for (const requested of [MODES.PAPER, MODES.ADVISORY, undefined]) {
    assert.equal(resolveMode({ verdict: 'PROVEN EDGE' }, requested).brokerExecution, false);
  }
});

test('paper mode hides a signal without pretending the market said no', () => {
  const stats = goodStats();
  const paper = evaluateGates({ setup: { id: 'GOOD' }, context: ctx(), stats, mode: resolveMode({ verdict: 'POSSIBLE EDGE' }) });
  assert.equal(paper.marketTradable, true, 'the evidence qualified; only the mode held it back');
  assert.equal(paper.tradable, false);
  assert.equal(paper.paperOnly, true);
  assert.deepEqual(paper.marketBlockedBy, [], 'no market gate blocked this');
  assert.deepEqual(paper.blockedBy, ['PAPER_TRADING_ONLY']);
  assert.equal(paper.mode, MODES.PAPER);

  const advisory = evaluateGates({ setup: { id: 'GOOD' }, context: ctx(), stats, mode: resolveMode({ verdict: 'PROVEN EDGE' }) });
  assert.equal(advisory.tradable, true);
  assert.equal(advisory.paperOnly, false);
  assert.deepEqual(advisory.blockedBy, []);
});

test('advisory mode does not loosen a single statistical gate', () => {
  // The same setup that fails on the evidence must fail in either mode; the mode
  // decides presentation and nothing else.
  const bad = goodStats({ setup: { outOfSample: { trades: 400, expectancy: 0.2, profitFactor: 1.5, ci95: [-0.01, 0.4] } } });
  for (const verdict of ['POSSIBLE EDGE', 'PROVEN EDGE']) {
    const g = evaluateGates({ setup: { id: 'GOOD' }, context: ctx(), stats: bad, mode: resolveMode({ verdict }) });
    assert.equal(g.marketTradable, false, `${verdict} must not rescue a failed interval`);
    assert.equal(g.tradable, false);
    assert.ok(g.marketBlockedBy.includes('INTERVAL_INCLUDES_ZERO'));
  }
});

test('a quarantined setup stays refused in advisory mode', () => {
  const stats = goodStats({ setup: { state: 'DISABLED_NEGATIVE_EDGE', stateReason: 'negative out of sample' } });
  const g = evaluateGates({ setup: { id: 'GOOD' }, context: ctx({ evidenceScore: 100 }), stats, mode: resolveMode({ verdict: 'PROVEN EDGE' }) });
  assert.equal(g.marketTradable, false);
  assert.equal(g.tradable, false);
  assert.ok(g.blockedBy.includes('DISABLED_NEGATIVE_EDGE'));
});
