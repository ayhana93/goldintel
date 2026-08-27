// Phase 19 — Monte Carlo analysis on the trade sequence.
//
// One historical equity curve is one sample from a distribution. The order in
// which the same trades arrived is close to arbitrary, and the drawdown you
// would actually have lived through depends heavily on that order. This
// resamples to estimate what the strategy's risk profile really is.

/** Deterministic PRNG so every published figure can be reproduced exactly. */
function makeRng(seed = 12345) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function drawdownOf(rs) {
  let cum = 0, peak = 0, worst = 0;
  for (const r of rs) {
    cum += r;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > worst) worst = dd;
  }
  return worst;
}

function quantile(sortedAsc, q) {
  if (!sortedAsc.length) return null;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? sortedAsc[lo] : sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

/**
 * @param trades      realized trades
 * @param mode        'shuffle' keeps the exact multiset of outcomes and only
 *                    reorders it; 'bootstrap' resamples with replacement, which
 *                    also captures sampling error in the outcome distribution
 * @param riskPct     risk per trade, for the probability-of-ruin calculation
 * @param ruinPct     equity loss that counts as ruin
 */
export function monteCarlo(trades, {
  runs = 5000, mode = 'bootstrap', seed = 12345,
  riskPct = 1, ruinPct = 50, tradesPerYear = null,
} = {}) {
  const rs = trades.map((t) => t.rMultiple);
  const n = rs.length;
  if (n < 10) return { runs: 0, note: 'Too few trades for a meaningful Monte Carlo.' };

  const rnd = makeRng(seed);
  const finals = [], dds = [], ruins = [];
  const perYear = tradesPerYear ?? n;

  for (let k = 0; k < runs; k++) {
    let seq;
    if (mode === 'shuffle') {
      seq = rs.slice();
      for (let i = seq.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [seq[i], seq[j]] = [seq[j], seq[i]];
      }
    } else {
      seq = new Array(n);
      for (let i = 0; i < n; i++) seq[i] = rs[Math.floor(rnd() * n)];
    }
    finals.push(seq.reduce((a, b) => a + b, 0));
    dds.push(drawdownOf(seq));

    // Ruin: compound equity at riskPct per trade, stop if it drops below the threshold.
    let equity = 100, ruined = false;
    for (const r of seq) {
      equity *= 1 + (r * riskPct) / 100;
      if (equity <= 100 * (1 - ruinPct / 100)) { ruined = true; break; }
    }
    ruins.push(ruined);
  }

  const fs = finals.slice().sort((a, b) => a - b);
  const ds = dds.slice().sort((a, b) => a - b);

  // Probability of a losing year, from year-length blocks of the same distribution.
  const yearRuns = 2000;
  let negYears = 0;
  for (let k = 0; k < yearRuns; k++) {
    let sum = 0;
    for (let i = 0; i < Math.max(1, Math.round(perYear)); i++) sum += rs[Math.floor(rnd() * n)];
    if (sum < 0) negYears++;
  }

  return {
    runs, mode, seed, sampleTrades: n,
    finalR: {
      mean: fs.reduce((a, b) => a + b, 0) / fs.length,
      p05: quantile(fs, 0.05), p25: quantile(fs, 0.25), median: quantile(fs, 0.5),
      p75: quantile(fs, 0.75), p95: quantile(fs, 0.95),
      pctPositive: (fs.filter((x) => x > 0).length / fs.length) * 100,
    },
    drawdownR: {
      median: quantile(ds, 0.5), p75: quantile(ds, 0.75),
      p95: quantile(ds, 0.95), p99: quantile(ds, 0.99), worst: ds[ds.length - 1],
    },
    probabilityOfRuin: { ruinPct, riskPct, pct: (ruins.filter(Boolean).length / runs) * 100 },
    probabilityOfNegativeYear: { tradesPerYear: Math.round(perYear), pct: (negYears / yearRuns) * 100 },
  };
}
