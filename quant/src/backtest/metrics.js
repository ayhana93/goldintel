// Phases 9, 10 and 25 — performance statistics.
//
// Everything is computed from realized trades. Nothing is annualized without
// saying what by, and no number is presented as a probability unless it is one
// (a measured frequency with its sample size attached).

const YEAR_MS = 365.25 * 24 * 3600 * 1000;

function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function stdev(xs, mean) {
  if (xs.length < 2) return 0;
  return Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (xs.length - 1));
}

/** Peak-to-trough drawdown of a cumulative series. */
export function maxDrawdown(cumulative) {
  let peak = -Infinity, worst = 0, peakIdx = 0, troughIdx = 0, curPeakIdx = 0;
  for (let i = 0; i < cumulative.length; i++) {
    if (cumulative[i] > peak) { peak = cumulative[i]; curPeakIdx = i; }
    const dd = peak - cumulative[i];
    if (dd > worst) { worst = dd; peakIdx = curPeakIdx; troughIdx = i; }
  }
  return { depth: worst, peakIdx, troughIdx };
}

/**
 * @param trades  engine output
 * @param opts.accountSize  used for percentage drawdown
 */
export function computeMetrics(trades, opts = {}) {
  const { accountSize = 10_000, breakevenBand = 0.05 } = opts;
  const n = trades.length;
  const empty = {
    trades: 0, wins: 0, losses: 0, breakeven: 0, winRate: null, netR: 0, netPnl: 0,
    avgR: null, medianR: null, expectancy: null, profitFactor: null,
    avgWinR: null, avgLossR: null, payoff: null,
    maxDrawdownR: 0, maxDrawdownPct: 0, sharpe: null, sortino: null,
    avgMAE: null, avgMFE: null, tp1Rate: null, tp2Rate: null, tp3Rate: null,
    avgHoldingHours: null, cagr: null, costsR: 0,
  };
  if (n === 0) return empty;

  const rs = trades.map((t) => t.rMultiple);
  const sorted = [...rs].sort((a, b) => a - b);
  const wins = trades.filter((t) => t.rMultiple > breakevenBand);
  const losses = trades.filter((t) => t.rMultiple < -breakevenBand);
  const be = n - wins.length - losses.length;

  const grossWin = wins.reduce((a, t) => a + t.rMultiple, 0);
  const grossLoss = -losses.reduce((a, t) => a + t.rMultiple, 0);
  const netR = rs.reduce((a, b) => a + b, 0);
  const netPnl = trades.reduce((a, t) => a + t.realizedPnl, 0);
  const mean = netR / n;

  let cum = 0;
  const cumR = rs.map((r) => (cum += r));
  const ddR = maxDrawdown(cumR);

  let eq = accountSize;
  const eqCurve = trades.map((t) => (eq += t.realizedPnl));
  const ddEq = maxDrawdown([accountSize, ...eqCurve]);

  const sd = stdev(rs, mean);
  const downside = rs.filter((r) => r < 0);
  const dsd = downside.length > 1 ? Math.sqrt(downside.reduce((a, r) => a + r * r, 0) / downside.length) : 0;

  const spanMs = trades[n - 1].exitTime - trades[0].entryTime;
  const years = spanMs > 0 ? spanMs / YEAR_MS : null;
  const tradesPerYear = years ? n / years : null;
  const annFactor = tradesPerYear ? Math.sqrt(tradesPerYear) : null;

  const finalEq = accountSize + netPnl;
  const cagr = years && years > 0 && finalEq > 0
    ? (Math.pow(finalEq / accountSize, 1 / years) - 1) * 100
    : null;

  const costsR = trades.reduce((a, t) => a + (t.riskAmount > 0 ? t.costs / t.riskAmount : 0), 0);

  return {
    trades: n,
    wins: wins.length, losses: losses.length, breakeven: be,
    winRate: (wins.length / n) * 100,
    netR, netPnl,
    avgR: mean,
    medianR: quantile(sorted, 0.5),
    expectancy: mean,                          // expectancy IS the mean R per trade
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : null),
    avgWinR: wins.length ? grossWin / wins.length : null,
    avgLossR: losses.length ? -grossLoss / losses.length : null,
    payoff: wins.length && losses.length ? (grossWin / wins.length) / (grossLoss / losses.length) : null,
    maxDrawdownR: ddR.depth,
    maxDrawdownPct: (ddEq.depth / accountSize) * 100,
    sharpe: sd > 0 && annFactor ? (mean / sd) * annFactor : null,
    sortino: dsd > 0 && annFactor ? (mean / dsd) * annFactor : null,
    avgMAE: trades.reduce((a, t) => a + t.mae, 0) / n,
    avgMFE: trades.reduce((a, t) => a + t.mfe, 0) / n,
    medianMAE: quantile(trades.map((t) => t.mae).sort((a, b) => a - b), 0.5),
    medianMFE: quantile(trades.map((t) => t.mfe).sort((a, b) => a - b), 0.5),
    tp1Rate: (trades.filter((t) => t.tp1Hit).length / n) * 100,
    tp2Rate: (trades.filter((t) => t.tp2Hit).length / n) * 100,
    tp3Rate: (trades.filter((t) => t.tp3Hit).length / n) * 100,
    avgHoldingHours: trades.reduce((a, t) => a + t.holdingHours, 0) / n,
    finalEquity: finalEq,
    cagr,
    years,
    tradesPerYear,
    costsR,
    rQuantiles: {
      p05: quantile(sorted, 0.05), p25: quantile(sorted, 0.25),
      p75: quantile(sorted, 0.75), p95: quantile(sorted, 0.95),
    },
  };
}

/** Group trades by an arbitrary key and compute metrics per group. */
export function groupMetrics(trades, keyFn, opts = {}) {
  const groups = new Map();
  for (const t of trades) {
    const k = keyFn(t);
    if (k == null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const out = {};
  for (const [k, list] of groups) out[k] = computeMetrics(list, opts);
  return out;
}

/** Histogram of R outcomes, for the distribution chart. */
export function rHistogram(trades, { binWidth = 0.25, min = -3, max = 5 } = {}) {
  const bins = [];
  for (let x = min; x < max; x += binWidth) bins.push({ from: x, to: x + binWidth, count: 0 });
  for (const t of trades) {
    const r = Math.max(min, Math.min(max - 1e-9, t.rMultiple));
    const i = Math.min(bins.length - 1, Math.floor((r - min) / binWidth));
    bins[i].count++;
  }
  return bins;
}

/** Monthly breakdown for the dashboard. */
export function monthlyBreakdown(trades, opts = {}) {
  return groupMetrics(trades, (t) => new Date(t.exitTime).toISOString().slice(0, 7), opts);
}

/** Cumulative-R equity curve with running drawdown, for plotting. */
export function equitySeries(trades, { accountSize = 10_000 } = {}) {
  let cumR = 0, eq = accountSize, peak = accountSize;
  return trades.map((t) => {
    cumR += t.rMultiple;
    eq += t.realizedPnl;
    peak = Math.max(peak, eq);
    return {
      time: t.exitTime, cumR, equity: eq,
      drawdown: peak - eq,
      drawdownPct: ((peak - eq) / peak) * 100,
    };
  });
}

/**
 * MAE / MFE study (Phase 10). Answers: how much heat did winners take, and how
 * far did losers actually run before failing? That is what tells you whether a
 * stop is too tight and whether a target is reachable.
 */
export function maeMfeStudy(trades) {
  const winners = trades.filter((t) => t.rMultiple > 0.05);
  const losers = trades.filter((t) => t.rMultiple < -0.05);
  const q = (arr, p) => {
    const s = [...arr].sort((a, b) => a - b);
    return quantile(s, p);
  };
  return {
    winners: {
      n: winners.length,
      maeP50: q(winners.map((t) => t.mae), 0.5),
      maeP75: q(winners.map((t) => t.mae), 0.75),
      maeP90: q(winners.map((t) => t.mae), 0.9),
      mfeP50: q(winners.map((t) => t.mfe), 0.5),
    },
    losers: {
      n: losers.length,
      mfeP50: q(losers.map((t) => t.mfe), 0.5),
      mfeP75: q(losers.map((t) => t.mfe), 0.75),
      mfeP90: q(losers.map((t) => t.mfe), 0.9),
      maeP50: q(losers.map((t) => t.mae), 0.5),
    },
    /**
     * Fraction of ALL trades whose MFE reached each R level. This is the ceiling
     * on what a fixed target could have captured, before costs.
     */
    mfeReach: [0.5, 1, 1.5, 2, 2.5, 3, 4, 5].map((r) => ({
      r,
      pct: trades.length ? (trades.filter((t) => t.mfe >= r).length / trades.length) * 100 : null,
    })),
    maeSurvive: [0.25, 0.5, 0.75, 1].map((r) => ({
      r,
      pct: trades.length ? (trades.filter((t) => t.mae <= r).length / trades.length) * 100 : null,
    })),
  };
}
