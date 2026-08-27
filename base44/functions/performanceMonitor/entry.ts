import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { EDGE_STATS } from '../../shared/edgeStats.ts';

// Phase 31 — rolling live/paper performance monitor.
//
// Compares what the paper trades are actually doing against what the backtest
// said to expect, over the last 20, 50 and 100 closed trades. When realized
// performance falls far enough below the backtested expectation that chance is
// an unlikely explanation, it raises EDGE_DEGRADATION.
//
// The comparison is one-sided on purpose: the point is to catch an edge that has
// stopped working, not to celebrate a lucky streak.
//
// generateSignals records a paper trade for every non-quarantined setup, gated or
// not, so the blocked ones form a control group for the gates. That makes the
// split below mandatory: the headline must be measured ONLY on trades the system
// would actually have signalled, or the gates would be silently marking their own
// homework. Trades recorded before `gate_passed` existed are counted in neither
// stream and reported separately, because their provenance is genuinely unknown.

const WINDOWS = [20, 50, 100];

/** GATED = the system signalled it. BLOCKED = a gate refused it. LEGACY = recorded before the field existed. */
function streamOf(t) {
  if (t.gate_passed === true) return 'gated';
  if (t.gate_passed === false) return 'blocked';
  return 'legacy';
}

function stats(rs) {
  const n = rs.length;
  if (n === 0) return { n: 0 };
  const mean = rs.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? rs.reduce((a, r) => a + (r - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const wins = rs.filter((r) => r > 0.05).length;
  const grossWin = rs.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const grossLoss = -rs.filter((r) => r < 0).reduce((a, b) => a + b, 0);
  return {
    n,
    expectancy: round(mean),
    sd: round(sd),
    se: round(n > 1 ? sd / Math.sqrt(n) : null),
    winRate: round((wins / n) * 100),
    profitFactor: grossLoss > 0 ? round(grossWin / grossLoss) : null,
    netR: round(rs.reduce((a, b) => a + b, 0)),
  };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const db = base44.asServiceRole.entities;
    const all = await db.PaperTrade.list('-signal_time', 500);
    const allClosed = all
      .filter((t) => t.status === 'CLOSED' && Number.isFinite(t.realized_r))
      .sort((a, b) => Date.parse(b.exit_time ?? b.signal_time) - Date.parse(a.exit_time ?? a.signal_time));

    // The headline stream: only what the gates let through.
    const closedTrades = allClosed.filter((t) => streamOf(t) === 'gated');
    const blockedClosed = allClosed.filter((t) => streamOf(t) === 'blocked');
    const legacyClosed = allClosed.filter((t) => streamOf(t) === 'legacy');

    const bySetup = {};
    for (const t of closedTrades) {
      (bySetup[t.setup_id] ??= []).push(t.realized_r);
    }

    // What the refused setups went on to do. If this beats the gated stream over a
    // meaningful sample, a gate is costing money and should be re-examined — the
    // number is reported either way rather than only when it flatters the design.
    const blocked = stats(blockedClosed.map((t) => t.realized_r));
    const blockedBy = {};
    for (const t of blockedClosed) {
      for (const reason of t.blocked_by ?? []) (blockedBy[reason] ??= []).push(t.realized_r);
    }

    const rolling = {};
    for (const w of WINDOWS) {
      rolling[`last${w}`] = stats(closedTrades.slice(0, w).map((t) => t.realized_r));
    }

    // Expected performance, weighted by which setups actually traded.
    const expectedFor = (setupId) => EDGE_STATS.measured.setups[setupId]?.outOfSample?.expectancy ?? null;
    const window = closedTrades.slice(0, 100);
    const expectations = window.map((t) => expectedFor(t.setup_id)).filter((x) => x != null);
    const expectedExpectancy = expectations.length
      ? expectations.reduce((a, b) => a + b, 0) / expectations.length
      : null;

    const live = rolling.last100;
    let status = 'INSUFFICIENT_DATA';
    let detail = `Only ${live.n} closed paper trades that cleared the gates so far. At least 20 are needed before live behaviour says anything.`;
    let zScore = null;

    if (live.n >= 20 && expectedExpectancy != null && live.se) {
      // How many standard errors below the backtested expectation is the live mean?
      zScore = round((live.expectancy - expectedExpectancy) / live.se);
      if (zScore <= -2) {
        status = 'EDGE_DEGRADATION';
        detail = `Realized expectancy ${live.expectancy}R over ${live.n} trades is ${Math.abs(zScore)} standard errors below the backtested ${round(expectedExpectancy)}R. Chance is an unlikely explanation.`;
      } else if (zScore <= -1) {
        status = 'WATCH';
        detail = `Realized expectancy ${live.expectancy}R is running below the backtested ${round(expectedExpectancy)}R, but still within ordinary variation.`;
      } else {
        status = 'IN_LINE';
        detail = `Realized expectancy ${live.expectancy}R is consistent with the backtested ${round(expectedExpectancy)}R.`;
      }
    }

    const perSetup = Object.fromEntries(Object.entries(bySetup).map(([id, rs]) => [id, {
      live: stats(rs),
      backtestedOutOfSample: EDGE_STATS.measured.setups[id]?.outOfSample ?? null,
      tier: EDGE_STATS.measured.setups[id]?.tier ?? 'NO_TRADE',
    }]));

    return Response.json({
      mode: user.trading_mode ?? EDGE_STATS.gating.defaultMode,
      systemVerdict: EDGE_STATS.verdict,
      status, detail, zScore,
      expectedExpectancy: round(expectedExpectancy),
      rolling,
      perSetup,
      openTrades: all.filter((t) => t.status === 'OPEN').length,
      totalClosed: closedTrades.length,
      // The control group, kept visible rather than folded into the headline.
      blockedStream: {
        ...blocked,
        note: 'Setups whose conditions held but which a gate refused. Recorded so the gates can be judged by what they cost, not only by what they prevent. Never included in the headline.',
        byReason: Object.fromEntries(Object.entries(blockedBy).map(([r, rs]) => [r, stats(rs)])),
      },
      unlabelledTrades: {
        n: legacyClosed.length,
        note: 'Recorded before the gate verdict was stored. Provenance unknown, so counted in neither stream.',
      },
      // Signal emission is already gated off; this is what would additionally
      // stop paper recording if the monitor is wired to act rather than report.
      recommendation: status === 'EDGE_DEGRADATION'
        ? 'Suspend the affected setups and re-run the research pipeline before recording further signals.'
        : 'Continue recording paper trades.',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function round(x) {
  return x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000;
}
