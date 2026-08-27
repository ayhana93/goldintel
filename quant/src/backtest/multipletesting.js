// Phase 36 — multiple-testing control.
//
// If you slice one dataset eight ways and keep the best slice, the best slice
// looks good whether or not anything is there. This module counts every
// hypothesis that was examined and reports what significance survives that count,
// so a "discovery" has to clear the bar it actually jumped rather than the bar it
// would have jumped if it had been the only thing tried.

/** Bonferroni: the simplest, most conservative correction. */
export function bonferroni(p, hypotheses) {
  return Math.min(1, p * hypotheses);
}

/**
 * Benjamini-Hochberg false discovery rate.
 *
 * Bonferroni controls the chance of ANY false positive and is brutal at scale.
 * BH controls the expected PROPORTION of false positives among the things you
 * call significant, which is the more useful question when screening dozens of
 * conditions.
 *
 * @param entries [{ key, p }]
 * @returns the same entries with qValue and whether they survive at `alpha`
 */
export function benjaminiHochberg(entries, alpha = 0.05) {
  const sorted = entries
    .filter((e) => e.p != null && Number.isFinite(e.p))
    .sort((a, b) => a.p - b.p);
  const m = sorted.length;
  if (m === 0) return [];

  // Walk from the largest p downward, enforcing monotonicity of q.
  let running = 1;
  const out = new Array(m);
  for (let i = m - 1; i >= 0; i--) {
    const q = Math.min(running, (sorted[i].p * m) / (i + 1));
    running = q;
    out[i] = { ...sorted[i], rank: i + 1, hypotheses: m, qValue: q, survivesFDR: q <= alpha };
  }
  return out;
}

/**
 * How many of these results would you expect purely by chance?
 * Useful as a sanity line in a report: "6 of 48 cells look significant at 0.05,
 * and chance alone would produce 2.4".
 */
export function expectedFalsePositives(hypotheses, alpha = 0.05) {
  return hypotheses * alpha;
}

/**
 * A screen's summary. `discoveries` counts nominally significant cells;
 * `expected` is what noise alone would produce; `excess` is the difference.
 * When excess is near zero the screen found nothing, however good its best cell.
 */
export function screenSummary(entries, alpha = 0.05) {
  const withP = entries.filter((e) => e.p != null && Number.isFinite(e.p));
  const discoveries = withP.filter((e) => e.p <= alpha).length;
  const expected = expectedFalsePositives(withP.length, alpha);
  const bh = benjaminiHochberg(withP, alpha);
  return {
    hypotheses: withP.length,
    alpha,
    nominalDiscoveries: discoveries,
    expectedByChance: Math.round(expected * 100) / 100,
    excessOverChance: Math.round((discoveries - expected) * 100) / 100,
    survivingFDR: bh.filter((e) => e.survivesFDR).map((e) => ({ key: e.key, p: e.p, q: Math.round(e.qValue * 10000) / 10000 })),
    bonferroniThreshold: Math.round((alpha / Math.max(1, withP.length)) * 1e6) / 1e6,
  };
}
