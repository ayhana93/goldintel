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
// Keep in sync with base44/shared/gating.ts — quant/test/mirror.test.js enforces it.

export const DEFAULT_GATES = {
  // Statistical bar, applied to the OUT-OF-SAMPLE record only. A setup chosen for
  // its development numbers can never be justified by those same numbers.
  minOutOfSampleTrades: 100,
  minOutOfSampleExpectancy: 0.02,      // R per trade, after realistic costs
  minOutOfSampleProfitFactor: 1.10,
  requireIntervalAboveZero: true,      // the 95% bootstrap interval must exclude zero

  // The bar above is a statement about the VALIDATED PORTFOLIO — see the note on
  // evaluateGates. A single component of that portfolio is held to a weaker and
  // separate bar: it is not asked to prove an edge alone, only to not be a drag.
  minComponentExpectancy: 0,           // R per trade, out of sample
  minComponentProfitFactor: 1.0,

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
export function evaluateGates({ setup, context, stats, gates = {}, mode = null }) {
  const g = { ...DEFAULT_GATES, ...(stats?.gating?.thresholds ?? {}), ...gates };
  const blockedBy = [];
  const reasons = [];

  // Gates 1-6 are about the MARKET and the evidence. The trading mode is a
  // separate question — how the result is presented — and is deliberately kept
  // out of them, so `marketTradable` still answers "would this have been a
  // signal" while the system is in paper mode. Conflating the two made the card
  // read NO TRADE as if the market had been judged, when the system was simply
  // switched off.

  // --- 1. the setup must be enabled ------------------------------------------
  const record = stats?.measured?.setups?.[setup.id] ?? null;
  if (!record) {
    blockedBy.push('NO_MEASURED_HISTORY');
    reasons.push(`${setup.id} has no measured history. An untested setup and a tested-and-failed setup are equally unfit to risk money on.`);
  } else if (record.state === 'DISABLED_NEGATIVE_EDGE') {
    blockedBy.push('DISABLED_NEGATIVE_EDGE');
    reasons.push(`${setup.id} is quarantined: ${record.stateReason}`);
  }

  // --- 2. statistical bar ----------------------------------------------------
  //
  // Applied to the unit that was actually validated. That distinction is not
  // pedantry: it decides whether the system can ever say yes.
  //
  // What earned the verdict is the PORTFOLIO — the long-only strategy as a
  // whole: 355 out-of-sample trades, +0.171R, 95% interval [+0.048, +0.298],
  // which excludes zero. Taken one at a time, NOT ONE component setup has an
  // interval excluding zero; each is too small a sample to prove itself alone.
  // So while this bar was applied per setup, every setup failed
  // INTERVAL_INCLUDES_ZERO and the engine could not emit a signal in any market,
  // ever. That is not conservatism, it is a category error: it demanded of each
  // part a proof that was only ever established for the whole.
  //
  // The portfolio therefore carries the statistical proof, and the component is
  // held to the weaker bar below — not negative, not a drag. Nothing here is
  // loosened to manufacture a signal: the strict test still has to pass, on the
  // sample where it was established, and the quarantine above still removes any
  // setup that lost money out of sample.
  const portfolioKey = stats?.gating?.portfolioKey ?? null;
  const portfolio = portfolioKey ? (stats?.measured?.strategies?.[portfolioKey] ?? null) : null;
  const proof = portfolio?.outOfSample ?? record?.outOfSample ?? null;
  const proofLabel = portfolio ? `the validated portfolio (${portfolioKey})` : setup.id;

  if (portfolio?.state === 'DISABLED_NEGATIVE_EDGE') {
    blockedBy.push('PORTFOLIO_DISABLED');
    reasons.push(`${proofLabel} is quarantined: ${portfolio.stateReason}`);
  }

  if (proof) {
    if ((proof.trades ?? 0) < g.minOutOfSampleTrades) {
      blockedBy.push('INSUFFICIENT_SAMPLE');
      reasons.push(`Only ${proof.trades} out-of-sample trades on ${proofLabel}; ${g.minOutOfSampleTrades} are required.`);
    }
    if ((proof.expectancy ?? -Infinity) < g.minOutOfSampleExpectancy) {
      blockedBy.push('EXPECTANCY_BELOW_MINIMUM');
      reasons.push(`Out-of-sample expectancy ${fmt(proof.expectancy)}R on ${proofLabel} is below the ${g.minOutOfSampleExpectancy}R minimum.`);
    }
    if ((proof.profitFactor ?? 0) < g.minOutOfSampleProfitFactor) {
      blockedBy.push('PROFIT_FACTOR_BELOW_MINIMUM');
      reasons.push(`Out-of-sample profit factor ${fmt(proof.profitFactor, 2)} on ${proofLabel} is below the ${g.minOutOfSampleProfitFactor} minimum.`);
    }
    if (g.requireIntervalAboveZero && !(proof.ci95 && proof.ci95[0] > 0)) {
      blockedBy.push('INTERVAL_INCLUDES_ZERO');
      reasons.push(`The 95% interval on out-of-sample expectancy for ${proofLabel}${proof.ci95 ? ` [${proof.ci95.join(', ')}]` : ''} does not exclude zero, so the edge is not established.`);
    }
  }

  // --- 2b. the component must not be a drag on the portfolio -----------------
  // A setup rides the portfolio's proof; it does not get to ride it while losing
  // money itself. This is a weaker test than the one above by design, and it is
  // the only thing the individual setup's own numbers are asked to pass.
  const own = record?.outOfSample;
  if (portfolio && own) {
    if ((own.expectancy ?? -Infinity) < g.minComponentExpectancy || (own.profitFactor ?? 0) < g.minComponentProfitFactor) {
      blockedBy.push('COMPONENT_NEGATIVE');
      reasons.push(`${setup.id} is a losing component: expectancy ${fmt(own.expectancy)}R, profit factor ${fmt(own.profitFactor, 2)} over ${own.trades} out-of-sample trades. It may not ride the portfolio's record while dragging it down.`);
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

  const marketTradable = blockedBy.length === 0;
  if (marketTradable) {
    reasons.push(`Every market gate passed. ${cap(proofLabel)}: ${proof.trades} out-of-sample trades, expectancy ${fmt(proof.expectancy)}R, profit factor ${fmt(proof.profitFactor, 2)}, interval [${proof.ci95.join(', ')}].`);
    if (portfolio && own) {
      reasons.push(`${setup.id} contributed ${own.trades} of those trades at ${fmt(own.expectancy)}R each.`);
    }
  }

  // --- 7. presentation mode --------------------------------------------------
  const paper = mode ? mode.mode === 'PAPER' : !!stats?.gating?.paperTradingOnly;
  const modeBlocked = [...blockedBy];
  if (paper) {
    modeBlocked.push('PAPER_TRADING_ONLY');
    if (marketTradable) {
      reasons.push(`Recorded as a paper trade rather than a recommendation: ${mode?.reason ?? stats?.gating?.reason ?? 'the system is in paper-trading mode.'}`);
    }
  }

  return {
    /** Would this have been a signal on the evidence alone? */
    marketTradable,
    /** Is it presented as actionable? False in paper mode, by design. */
    tradable: marketTradable && !paper,
    /** True when only the mode stands between this and a recommendation. */
    paperOnly: marketTradable && paper,
    blockedBy: modeBlocked,
    marketBlockedBy: blockedBy,
    reasons,
    gates: g,
    /** Which record carried the statistical proof, so the UI can name it. */
    provenBy: portfolio ? { key: portfolioKey, ...proof } : null,
    mode: mode?.mode ?? (paper ? 'PAPER' : 'ADVISORY'),
  };
}

function fmt(x, d = 3) {
  return x == null || !Number.isFinite(x) ? 'n/a' : x.toFixed(d);
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
