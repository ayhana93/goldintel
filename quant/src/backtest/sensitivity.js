// Phase 28 — parameter sensitivity.
//
// A real edge is a broad plateau, not a spike. If moving EMA 20 to 19 or 21
// destroys the result, what was measured was the dataset, not the market.

import { runBacktest } from './engine.js';
import { computeMetrics } from './metrics.js';

/**
 * @param axes  { paramName: [values...] } — each axis is varied on its own,
 *              around the base config. Full grids are avoided deliberately:
 *              searching a grid IS the overfitting the phase exists to detect.
 */
export function sensitivitySweep({
  ctx, baseConfig, axes, buildStrategy, buildContextFor = null,
  execution = 'realistic', risk = {}, newsWindow = null,
  fromMs, toMs, options = {}, metricsOpts = {},
}) {
  const run = (cfg) => {
    const useCtx = buildContextFor ? buildContextFor(cfg) : ctx;
    const r = runBacktest({
      ctx: useCtx, strategy: buildStrategy(cfg), execution, risk, newsWindow,
      fromMs, toMs, options,
    });
    return computeMetrics(r.trades, metricsOpts);
  };

  const base = run(baseConfig);
  const results = {};

  for (const [param, values] of Object.entries(axes)) {
    results[param] = values.map((v) => {
      const cfg = structuredClone(baseConfig);
      setDeep(cfg, param, v);
      const m = run(cfg);
      return {
        value: v, trades: m.trades,
        expectancy: m.expectancy, profitFactor: m.profitFactor,
        winRate: m.winRate, maxDrawdownR: m.maxDrawdownR,
      };
    });
  }

  // Overfit heuristics, applied per axis.
  const flags = {};
  for (const [param, rows] of Object.entries(results)) {
    const exps = rows.map((r) => r.expectancy).filter((x) => x != null);
    if (exps.length < 3) { flags[param] = 'INSUFFICIENT'; continue; }
    // An axis the chosen configuration does not actually read produces identical
    // results at every value. Reporting that as STABLE would flatter the
    // strategy by counting a parameter it ignores as evidence of robustness.
    const spread = Math.max(...exps) - Math.min(...exps);
    if (spread < 1e-9) { flags[param] = 'INERT'; continue; }
    const positive = exps.filter((x) => x > 0).length;
    const best = Math.max(...exps);
    const others = exps.filter((x) => x !== best);
    const meanOthers = others.reduce((a, b) => a + b, 0) / others.length;
    const spike = best > 0 && meanOthers <= 0;                     // only one value works
    const fragile = positive / exps.length < 0.5;                  // most of the neighbourhood loses
    flags[param] = spike ? 'SPIKE' : fragile ? 'FRAGILE' : 'STABLE';
  }

  const live = Object.values(flags).filter((f) => f !== 'INERT' && f !== 'INSUFFICIENT');
  const spikes = live.filter((f) => f === 'SPIKE').length;
  const fragiles = live.filter((f) => f === 'FRAGILE').length;
  // With nothing live to test, robustness is unknown rather than proven.
  const overfitRisk = live.length === 0 ? 'UNKNOWN'
    : spikes > 0 ? 'HIGH'
    : fragiles >= 2 ? 'ELEVATED'
    : fragiles === 1 ? 'MODERATE'
    : 'LOW';

  return { base, results, flags, overfitRisk, liveAxes: live.length, inertAxes: Object.values(flags).filter((f) => f === 'INERT').length };
}

function setDeep(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}
