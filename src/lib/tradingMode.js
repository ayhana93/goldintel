// How the system presents its own signals.
//
// This used to be a hardcoded `paperTradingOnly: true` inside a generated file,
// with no way to see or change it and no rule behind it — the explanatory text
// varied with the verdict but the flag never did. That is fixed here: the
// default is DERIVED from the measured evidence by the rule below, and the owner
// can override it deliberately.
//
// What no mode does is connect a broker. Automatic execution is not implemented
// and is out of scope until paper results match backtested expectations over a
// meaningful sample — see docs/EDGE_REPORT.md.
//
// Keep in sync with base44/shared/tradingMode.ts — quant/test/mirror.test.js enforces it.

export const MODES = {
  /** Signals are recorded and simulated. Presented as research, not advice. */
  PAPER: 'PAPER',
  /** Signals are presented as actionable. Still no broker, still no auto-execution. */
  ADVISORY: 'ADVISORY',
};

/**
 * The rule, written down once.
 *
 * ADVISORY is earned, not chosen: it requires a PROVEN EDGE verdict. Anything
 * weaker means the out-of-sample record has not cleared the bar in
 * quant/src/backtest/edge.js, and presenting such signals as recommendations
 * would be claiming more than the data supports.
 */
export function defaultModeFor(stats) {
  return stats?.verdict === 'PROVEN EDGE' ? MODES.ADVISORY : MODES.PAPER;
}

/**
 * Resolve the mode actually in force, given the owner's setting.
 *
 * The owner may override — it is their application and their money — but an
 * override that runs ahead of the evidence is recorded as such, so the interface
 * can keep saying so rather than quietly forgetting.
 */
export function resolveMode(stats, requested) {
  const fallback = defaultModeFor(stats);
  const mode = requested === MODES.ADVISORY || requested === MODES.PAPER ? requested : fallback;
  const overridden = mode !== fallback;

  let reason;
  if (mode === MODES.PAPER) {
    reason = overridden
      ? 'Paper trading, chosen by you. The evidence would allow advisory mode.'
      : paperReason(stats);
  } else {
    reason = overridden
      ? `Advisory mode, chosen by you, ahead of the evidence: the backtest verdict is ${stats?.verdict ?? 'UNKNOWN'}, not PROVEN EDGE. ${paperReason(stats)}`
      : 'Advisory mode: the out-of-sample record cleared every criterion in the edge classifier.';
  }

  return {
    mode,
    default: fallback,
    overridden,
    /** True when the owner has moved ahead of what the evidence supports. */
    aheadOfEvidence: overridden && mode === MODES.ADVISORY,
    reason,
    verdict: stats?.verdict ?? 'UNKNOWN',
    brokerExecution: false,
  };
}

function paperReason(stats) {
  const v = stats?.verdict ?? 'UNKNOWN';
  if (v === 'NO EDGE') return 'The best configuration tested shows no edge after realistic costs.';
  if (v === 'OVERFIT') return 'The best configuration is strong in sample and weak out of sample.';
  if (v === 'POSSIBLE EDGE') {
    const wf = stats?.walkForward;
    const legacy = wf?.legacyEra?.consistency, modern = wf?.modernEra?.consistency;
    const eras = legacy != null && modern != null
      ? ` Its out-of-sample record is positive, but ${Math.round(legacy * 100)}% of quarters are profitable in the earlier era against ${Math.round(modern * 100)}% in the recent one, so the evidence is era-specific.`
      : '';
    return `The best configuration is rated POSSIBLE EDGE.${eras}`;
  }
  return 'No configuration has demonstrated a durable edge.';
}
