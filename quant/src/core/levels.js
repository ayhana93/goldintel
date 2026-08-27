// Phases 11 & 12 — stop-loss and take-profit policies.
//
// Kept separate from setup detection so a setup's edge and a level policy's edge
// can be measured independently. Every policy is a pure function of closed-bar
// state; none of them may look at what happens after the entry bar.

/** ---------------- Stop-loss policies ---------------- */
export const STOP_POLICIES = {
  /** A — pure ATR distance. */
  atr: ({ price, direction, atr, cfg }) => {
    const k = cfg.atrMult ?? 1.5;
    return direction === 'LONG' ? price - k * atr : price + k * atr;
  },

  /** B — swing invalidation: just beyond the last confirmed swing. */
  swing: ({ price, direction, atr, swingLow, swingHigh, cfg }) => {
    const buf = (cfg.swingBufferAtr ?? 0.15) * atr;
    const floor = (cfg.minStopAtr ?? 0.5) * atr;
    if (direction === 'LONG') {
      const s = swingLow != null && swingLow < price ? swingLow - buf : price - (cfg.atrMult ?? 1.5) * atr;
      return Math.min(s, price - floor);
    }
    const s = swingHigh != null && swingHigh > price ? swingHigh + buf : price + (cfg.atrMult ?? 1.5) * atr;
    return Math.max(s, price + floor);
  },

  /** C — structure with an ATR buffer, capped so a distant swing cannot blow up risk. */
  structure_atr: ({ price, direction, atr, swingLow, swingHigh, cfg }) => {
    const buf = (cfg.swingBufferAtr ?? 0.3) * atr;
    const floor = (cfg.minStopAtr ?? 0.6) * atr;
    const cap = (cfg.maxStopAtr ?? 2.5) * atr;
    if (direction === 'LONG') {
      const s = swingLow != null && swingLow < price ? swingLow - buf : price - cap;
      return Math.max(Math.min(s, price - floor), price - cap);
    }
    const s = swingHigh != null && swingHigh > price ? swingHigh + buf : price + cap;
    return Math.min(Math.max(s, price + floor), price + cap);
  },

  /** D — volatility-adjusted: widen in calm markets, tighten when ATR is already extended. */
  volatility_adjusted: ({ price, direction, atr, volRatio, cfg }) => {
    const base = cfg.atrMult ?? 1.5;
    const r = volRatio ?? 1;
    const k = Math.max(cfg.minMult ?? 0.8, Math.min(cfg.maxMult ?? 2.5, base / Math.sqrt(r)));
    return direction === 'LONG' ? price - k * atr : price + k * atr;
  },

  /**
   * The production rule, reproduced exactly: Math.min / Math.max against the
   * entry-zone edge, which always selects the WIDER of the two candidates
   * (audit S2-4). Kept so the baseline is honest.
   */
  production: ({ price, direction, atr, swingLow, swingHigh }) => {
    if (direction === 'LONG') {
      const entryLow = price - 0.3 * atr;
      let sl = swingLow != null && swingLow < price ? swingLow - atr * 0.3 : price - atr * 1.5;
      return Math.min(sl, entryLow - atr * 0.8);
    }
    const entryHigh = price + 0.3 * atr;
    let sl = swingHigh != null && swingHigh > price ? swingHigh + atr * 0.3 : price + atr * 1.5;
    return Math.max(sl, entryHigh + atr * 0.8);
  },
};

/** ---------------- Take-profit policies ---------------- */
export const TARGET_POLICIES = {
  /** Fixed R multiples. */
  fixedR: ({ price, direction, risk, cfg }) => {
    const m = cfg.rMultiples ?? [1, 2, 3];
    const s = direction === 'LONG' ? 1 : -1;
    return m.map((x) => price + s * risk * x);
  },

  /** Nearest structure levels beyond a minimum distance, with R fallbacks. */
  structure: ({ price, direction, risk, levels, cfg }) => {
    const fallback = cfg.rMultiples ?? [1, 2, 3];
    const minR = cfg.minTargetR ?? 0.8;
    const s = direction === 'LONG' ? 1 : -1;
    const pool = (direction === 'LONG' ? levels.resistances : levels.supports)
      .map((l) => l.price)
      .filter((p) => s * (p - price) >= risk * minR)
      .sort((a, b) => Math.abs(a - price) - Math.abs(b - price));
    return fallback.map((mult, k) => pool[k] ?? price + s * risk * mult);
  },

  /** ATR multiples, independent of the stop distance. */
  atr: ({ price, direction, atr, cfg }) => {
    const m = cfg.atrMultiples ?? [1, 2, 3];
    const s = direction === 'LONG' ? 1 : -1;
    return m.map((x) => price + s * atr * x);
  },

  /**
   * The production rule: nearest two structure levels, then the FARTHEST level
   * floored at 5R. This is what inflates the advertised "Max R:R 1:5" — the 5R
   * is imposed by the code, not found in the market (audit S2-3).
   */
  production: ({ price, direction, risk, levels }) => {
    const s = direction === 'LONG' ? 1 : -1;
    const entryEdge = price + s * 0.1 * risk;
    const pool = (direction === 'LONG' ? levels.resistances : levels.supports)
      .map((l) => l.price)
      .filter((p) => s * (p - entryEdge) >= risk * 0.5)
      .sort((a, b) => Math.abs(a - price) - Math.abs(b - price));
    const fb = (m) => price + s * risk * m;
    const tp1 = pool[0] ?? fb(2);
    const tp2 = pool[1] ?? fb(3.5);
    const farthest = pool.length ? pool[pool.length - 1] : fb(5);
    const tp3 = direction === 'LONG' ? Math.max(farthest, fb(5)) : Math.min(farthest, fb(5));
    return [tp1, tp2, tp3];
  },
};

/**
 * Assemble a complete trade plan. Targets are always returned sorted in the
 * direction of the trade so TP1 < TP2 < TP3 in R terms.
 */
export function buildPlan({ price, direction, atr, volRatio, swingLow, swingHigh, levels,
                            stopPolicy = 'structure_atr', targetPolicy = 'fixedR',
                            stopCfg = {}, targetCfg = {} }) {
  const stopFn = STOP_POLICIES[stopPolicy];
  if (!stopFn) throw new Error(`Unknown stop policy: ${stopPolicy}`);
  const targetFn = TARGET_POLICIES[targetPolicy];
  if (!targetFn) throw new Error(`Unknown target policy: ${targetPolicy}`);

  const sl = stopFn({ price, direction, atr, volRatio, swingLow, swingHigh, cfg: stopCfg });
  const risk = Math.abs(price - sl);
  if (!(risk > 0)) return null;

  let tps = targetFn({ price, direction, risk, atr, levels, cfg: targetCfg });
  const s = direction === 'LONG' ? 1 : -1;
  tps = tps
    .filter((t) => Number.isFinite(t) && s * (t - price) > 0)
    .sort((a, b) => s * (a - b));
  if (tps.length === 0) return null;
  while (tps.length < 3) tps.push(tps[tps.length - 1]);

  return {
    entry: price,
    sl,
    risk,
    tp1: tps[0], tp2: tps[1], tp3: tps[2],
    rr1: Math.abs(tps[0] - price) / risk,
    rr2: Math.abs(tps[1] - price) / risk,
    rr3: Math.abs(tps[2] - price) / risk,
    stopPolicy, targetPolicy,
  };
}
