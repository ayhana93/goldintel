// Phase 29 — the edge decision engine.
//
// Classification is automatic and the thresholds are written down here, in one
// place, before any result is looked at. Every criterion reports pass/fail with
// its actual value so the verdict can be audited rather than believed.

export const EDGE_CRITERIA = {
  minOutOfSampleTrades: 100,
  minOutOfSampleExpectancy: 0.02,      // R per trade, after realistic costs
  minProfitFactor: 1.10,
  maxDrawdownR: 40,
  minWalkForwardConsistency: 0.55,     // share of out-of-sample windows in profit
  maxDegradation: 0.10,                // in-sample minus out-of-sample expectancy, R
  maxOverfitRisk: 'MODERATE',
  minCostSurvival: 0.30,               // expectancy under realistic / under zero cost
};

const RISK_ORDER = { LOW: 0, MODERATE: 1, ELEVATED: 2, HIGH: 3, UNKNOWN: 3 };

/**
 * @param input.outOfSample   metrics on data never used for any choice
 * @param input.inSample      metrics on the development period
 * @param input.walkForward   walkForward().summary
 * @param input.sensitivity   sensitivitySweep() result
 * @param input.costScenarios { zero, optimistic, realistic, conservative } metrics
 */
export function classifyEdge(input, criteria = EDGE_CRITERIA) {
  const { outOfSample, inSample, walkForward, sensitivity, costScenarios } = input;
  const checks = [];
  const check = (name, ok, actual, required) => { checks.push({ name, pass: !!ok, actual, required }); return !!ok; };

  const oos = outOfSample ?? {};
  const sample = check('out-of-sample sample size', (oos.trades ?? 0) >= criteria.minOutOfSampleTrades,
    oos.trades ?? 0, `>= ${criteria.minOutOfSampleTrades}`);
  const expectancy = check('out-of-sample expectancy', (oos.expectancy ?? -Infinity) >= criteria.minOutOfSampleExpectancy,
    round(oos.expectancy), `>= ${criteria.minOutOfSampleExpectancy} R`);
  const pf = check('out-of-sample profit factor', (oos.profitFactor ?? 0) >= criteria.minProfitFactor,
    round(oos.profitFactor), `>= ${criteria.minProfitFactor}`);
  const dd = check('out-of-sample max drawdown', (oos.maxDrawdownR ?? Infinity) <= criteria.maxDrawdownR,
    round(oos.maxDrawdownR), `<= ${criteria.maxDrawdownR} R`);

  const wf = walkForward ?? {};
  const consistency = check('walk-forward consistency', (wf.consistency ?? 0) >= criteria.minWalkForwardConsistency,
    round(wf.consistency), `>= ${criteria.minWalkForwardConsistency}`);
  const degradation = check('in-sample to out-of-sample degradation',
    (wf.degradation ?? Infinity) <= criteria.maxDegradation,
    round(wf.degradation), `<= ${criteria.maxDegradation} R`);

  const risk = sensitivity?.overfitRisk ?? 'HIGH';
  const stable = check('parameter sensitivity', RISK_ORDER[risk] <= RISK_ORDER[criteria.maxOverfitRisk],
    risk, `<= ${criteria.maxOverfitRisk}`);

  let costSurvival = null;
  if (costScenarios?.zero?.expectancy > 0 && costScenarios?.realistic?.expectancy != null) {
    costSurvival = costScenarios.realistic.expectancy / costScenarios.zero.expectancy;
  }
  const costs = check('survives realistic costs', (costSurvival ?? -1) >= criteria.minCostSurvival,
    round(costSurvival), `>= ${criteria.minCostSurvival} of frictionless expectancy`);

  // ---- verdict ----
  const isExp = inSample?.expectancy ?? null;
  const oosExp = oos.expectancy ?? null;
  const strongInSample = isExp != null && isExp >= criteria.minOutOfSampleExpectancy;
  const weakOutOfSample = oosExp == null || oosExp < criteria.minOutOfSampleExpectancy;

  let verdict;
  if (expectancy && pf && dd && consistency && degradation && stable && costs && sample) {
    verdict = 'PROVEN EDGE';
  } else if (strongInSample && weakOutOfSample && (!consistency || !degradation || !stable)) {
    verdict = 'OVERFIT';
  } else if (oosExp != null && oosExp <= 0) {
    verdict = 'NO EDGE';
  } else if (expectancy && (pf || consistency)) {
    verdict = 'POSSIBLE EDGE';
  } else {
    verdict = 'NO EDGE';
  }

  return {
    verdict,
    checks,
    passed: checks.filter((c) => c.pass).length,
    total: checks.length,
    criteria,
    costSurvival: round(costSurvival),
  };
}

function round(x) {
  if (x == null || !Number.isFinite(x)) return x ?? null;
  return Math.round(x * 10000) / 10000;
}
