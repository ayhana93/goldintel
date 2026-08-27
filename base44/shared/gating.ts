// Live signal gating.
//
// The default answer is NO TRADE. A signal becomes tradable only when EVERY gate
// passes, and the evidence score is deliberately not one of the gates that can
// carry a signal on its own: it is necessary, never sufficient. The score is a
// measure of how much current evidence points one way; whether that direction
// has ever paid is a separate, measured question.
//
// Every threshold is configurable and every one is justified by a number in
// docs/EDGE_REPORT.md rather than by taste.
//
// Keep in sync with src/lib/gating.js — quant/test/mirror.test.js enforces it.

export const DEFAULT_GATES = {
  // Statistical bar, applied to the OUT-OF-SAMPLE record only. A setup chosen for
  // its development numbers can never be justified by those same numbers.
  minOutOfSampleTrades: 100,
  minOutOfSampleExpectancy: 0.02,      // R per trade, after realistic costs
  minOutOfSampleProfitFactor: 1.10,
  requireIntervalAboveZero: true,      // the 95% bootstrap interval must exclude zero

  // Direction. Both sides start allowed; evidence removes one.
  allowedDirections: ['LONG', 'SHORT'],

  // Necessary but never sufficient.
  minEvidenceScore: 70,

  // Conditions where the measured record does not support trading.
  blockedRegimes: [],
  blockedSessions: [],
  maxNewsRisk: 'HIGH',                 // 'LOW' | 'MEDIUM' | 'HIGH'

  // Below this the cost model says the setup cannot survive its own spread.
  minStopDistanceAtr: 0.5,
};

const NEWS_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2 };

/**
 * setup    the detected setup, with its measured history attached
 * context  evidenceScore, regime, session, newsRisk, atr, plan, direction
 * stats    the generated EDGE_STATS document
 * gates    overrides for DEFAULT_GATES
 *
 * Returns tradable, blockedBy and reasons. The reasons always explain the
 * verdict, including when it is positive, so the UI never has to guess.
 */
export function evaluateGates({ setup, context, stats, gates = {} }) {
  const g = { ...DEFAULT_GATES, ...(stats?.gating?.thresholds ?? {}), ...gates };
  const blockedBy = [];
  const reasons = [];

  // --- 0. system-level kill switch -------------------------------------------
  if (stats?.gating?.paperTradingOnly) {
    blockedBy.push('PAPER_TRADING_ONLY');
    reasons.push(`The system is in paper-trading mode: ${stats.gating.reason ?? 'no configuration has demonstrated a durable edge.'}`);
  }

  // --- 1. the setup must be enabled ------------------------------------------
  const record = stats?.measured?.setups?.[setup.id] ?? null;
  if (!record) {
    blockedBy.push('NO_MEASURED_HISTORY');
    reasons.push(`${setup.id} has no measured history. An untested setup and a tested-and-failed setup are equally unfit to risk money on.`);
  } else if (record.state === 'DISABLED_NEGATIVE_EDGE') {
    blockedBy.push('DISABLED_NEGATIVE_EDGE');
    reasons.push(`${setup.id} is quarantined: ${record.stateReason}`);
  }

  // --- 2. statistical bar, on out-of-sample data only ------------------------
  const oos = record?.outOfSample;
  if (oos) {
    if ((oos.trades ?? 0) < g.minOutOfSampleTrades) {
      blockedBy.push('INSUFFICIENT_SAMPLE');
      reasons.push(`Only ${oos.trades} out-of-sample trades; ${g.minOutOfSampleTrades} are required before this setup can be traded.`);
    }
    if ((oos.expectancy ?? -Infinity) < g.minOutOfSampleExpectancy) {
      blockedBy.push('EXPECTANCY_BELOW_MINIMUM');
      reasons.push(`Out-of-sample expectancy ${fmt(oos.expectancy)}R is below the ${g.minOutOfSampleExpectancy}R minimum.`);
    }
    if ((oos.profitFactor ?? 0) < g.minOutOfSampleProfitFactor) {
      blockedBy.push('PROFIT_FACTOR_BELOW_MINIMUM');
      reasons.push(`Out-of-sample profit factor ${fmt(oos.profitFactor, 2)} is below the ${g.minOutOfSampleProfitFactor} minimum.`);
    }
    if (g.requireIntervalAboveZero && !(oos.ci95 && oos.ci95[0] > 0)) {
      blockedBy.push('INTERVAL_INCLUDES_ZERO');
      reasons.push(`The 95% interval on out-of-sample expectancy${oos.ci95 ? ` [${oos.ci95.join(', ')}]` : ''} does not exclude zero, so the edge is not established.`);
    }
  }

  // --- 3. direction ----------------------------------------------------------
  const allowed = stats?.gating?.allowedDirections ?? g.allowedDirections;
  if (!allowed.includes(context.direction)) {
    blockedBy.push('DIRECTION_DISABLED');
    reasons.push(`${context.direction} is disabled: ${stats?.gating?.directionReason ?? 'measured expectancy on this side is negative.'}`);
  }

  // --- 4. evidence score: necessary, not sufficient --------------------------
  if ((context.evidenceScore ?? 0) < g.minEvidenceScore) {
    blockedBy.push('EVIDENCE_BELOW_THRESHOLD');
    reasons.push(`Evidence score ${context.evidenceScore ?? 0}/100 is below the ${g.minEvidenceScore} threshold. (A score above it would not by itself make this tradable.)`);
  }

  // --- 5. conditions ---------------------------------------------------------
  if (g.blockedRegimes.includes(context.regime)) {
    blockedBy.push('REGIME_NOT_SUPPORTED');
    reasons.push(`Regime ${context.regime} is not supported by the measured record.`);
  }
  if (g.blockedSessions.includes(context.session)) {
    blockedBy.push('SESSION_NOT_SUPPORTED');
    reasons.push(`Session ${context.session} is not supported by the measured record.`);
  }
  if (NEWS_ORDER[context.newsRisk ?? 'LOW'] > NEWS_ORDER[g.maxNewsRisk]) {
    blockedBy.push('NEWS_RISK');
    reasons.push(`News risk ${context.newsRisk} exceeds the configured maximum of ${g.maxNewsRisk}.`);
  }

  // --- 6. the trade must be able to survive its own costs --------------------
  if (context.plan && context.atr) {
    const stopAtr = Math.abs(context.plan.entry - context.plan.sl) / context.atr;
    if (stopAtr < g.minStopDistanceAtr) {
      blockedBy.push('STOP_TOO_TIGHT_FOR_COSTS');
      reasons.push(`The stop is ${stopAtr.toFixed(2)} ATR away; below ${g.minStopDistanceAtr} ATR the spread is too large a share of the risk.`);
    }
  }

  const tradable = blockedBy.length === 0;
  if (tradable) {
    reasons.push(`All gates passed: ${oos.trades} out-of-sample trades, expectancy ${fmt(oos.expectancy)}R, profit factor ${fmt(oos.profitFactor, 2)}, interval [${oos.ci95.join(', ')}].`);
  }
  return { tradable, blockedBy, reasons, gates: g };
}

function fmt(x, d = 3) {
  return x == null || !Number.isFinite(x) ? 'n/a' : x.toFixed(d);
}
