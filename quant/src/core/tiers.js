// Phase 22 — evidence tiers.
//
// A tier is assigned from measured statistics, never from wording. The rules are
// written down here, once, and applied mechanically. A setup that has not been
// measured is not "unrated" — it is NO_TRADE, because an untested setup and a
// tested-and-failed setup are equally unfit to risk money on.

// Thresholds are applied to the OUT-OF-SAMPLE record only — the periods that
// were never used to choose the setup. Development-period statistics of a setup
// that was picked for having good development-period statistics are not
// evidence, and mixing them in is how a selection turns itself into a discovery.
export const TIER_RULES = {
  'A+': { minExpectancy: 0.15, minSample: 400, maxP: 0.01 },
  A: { minExpectancy: 0.10, minSample: 150, maxP: 0.02 },
  B: { minExpectancy: 0.03, minSample: 50, maxP: 0.10 },
  C: { minExpectancy: 0.0, minSample: 30, maxP: 1 },
};

export const TIER_ORDER = ['A+', 'A', 'B', 'C', 'NO_TRADE'];

/**
 * @param oos.trades      out-of-sample sample size
 * @param oos.expectancy  out-of-sample R per trade, after realistic costs
 * @param oos.p           bootstrap probability that the out-of-sample edge is <= 0
 */
export function assignTier(oos) {
  if (!oos || oos.trades == null) return { tier: 'NO_TRADE', reason: 'No out-of-sample history for this setup.' };
  for (const tier of ['A+', 'A', 'B', 'C']) {
    const r = TIER_RULES[tier];
    if (oos.trades < r.minSample) continue;
    if ((oos.expectancy ?? -Infinity) < r.minExpectancy) continue;
    if ((oos.p ?? 1) > r.maxP) continue;
    return { tier, reason: describe(tier, oos) };
  }
  return {
    tier: 'NO_TRADE',
    reason: `Out-of-sample expectancy ${fmt(oos.expectancy)}R over ${oos.trades} trades`
      + `, p(edge<=0)=${fmt(oos.p, 3)}. Below every tier threshold.`,
  };
}

function describe(tier, s) {
  return `${tier}: ${s.trades} out-of-sample trades, expectancy ${fmt(s.expectancy)}R, p(edge<=0)=${fmt(s.p, 3)}`;
}

function fmt(x, d = 3) {
  return x == null || !Number.isFinite(x) ? 'n/a' : x.toFixed(d);
}
