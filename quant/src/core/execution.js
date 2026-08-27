// Phase 5 — realistic execution.
//
// Candles are mid prices. A buyer pays the ask, a seller receives the bid, and a
// stop is only hit when the side of the book that would close the position
// reaches it. Modelling this properly is what separates a backtest from a
// drawing exercise: on the scalp tier the round-trip cost is a large fraction of
// the risk, and ignoring it is the difference between a strategy and a story.
//
//   half   = spread / 2   (distance from mid to each side of the book)
//   LONG   fill  = mid + half + slippage
//   SHORT  fill  = mid - half - slippage
//
// Stop and target triggering, for a LONG (mirror for SHORT):
//   stop   triggers when  bid <= SL   <=>  midLow  <= SL + half     fill SL - slippage
//   target triggers when  bid >= TP   <=>  midHigh >= TP + half     fill TP  (limit, no slippage)
//
// Commission is charged per unit per side.

export const SCENARIOS = {
  optimistic:   { spread: 0.15, slippage: 0.03, commissionPerUnit: 0.02, newsSpreadMult: 2, entryDelayBars: 1 },
  realistic:    { spread: 0.30, slippage: 0.10, commissionPerUnit: 0.035, newsSpreadMult: 3, entryDelayBars: 1 },
  conservative: { spread: 0.60, slippage: 0.25, commissionPerUnit: 0.05, newsSpreadMult: 4, entryDelayBars: 1 },
  /** Frictionless — used only to quantify how much of a result is pure cost. */
  zero:         { spread: 0, slippage: 0, commissionPerUnit: 0, newsSpreadMult: 1, entryDelayBars: 1 },
};

export function makeExecutionModel(name = 'realistic', overrides = {}) {
  const base = SCENARIOS[name];
  if (!base) throw new Error(`Unknown execution scenario: ${name}. Known: ${Object.keys(SCENARIOS).join(', ')}`);
  const cfg = { ...base, ...overrides };

  const halfSpread = (inNews) => (cfg.spread * (inNews ? cfg.newsSpreadMult : 1)) / 2;

  return {
    name,
    cfg,
    halfSpread,

    /** Fill price for opening a position at a mid price. */
    entryFill(mid, direction, inNews = false) {
      const h = halfSpread(inNews);
      return direction === 'LONG' ? mid + h + cfg.slippage : mid - h - cfg.slippage;
    },

    /** Did the stop trigger inside this bar, and at what price would it fill? */
    stopHit(bar, direction, sl, inNews = false) {
      const h = halfSpread(inNews);
      if (direction === 'LONG') {
        if (bar.low <= sl + h) return sl - cfg.slippage;
      } else if (bar.high >= sl - h) {
        return sl + cfg.slippage;
      }
      return null;
    },

    /** Did the target trigger inside this bar? Limit orders fill at the limit. */
    targetHit(bar, direction, tp, inNews = false) {
      const h = halfSpread(inNews);
      if (direction === 'LONG') {
        if (bar.high >= tp + h) return tp;
      } else if (bar.low <= tp - h) {
        return tp;
      }
      return null;
    },

    /** Closing at market, e.g. on expiry. */
    exitFill(mid, direction, inNews = false) {
      const h = halfSpread(inNews);
      return direction === 'LONG' ? mid - h - cfg.slippage : mid + h + cfg.slippage;
    },

    commission(units) {
      return Math.abs(units) * cfg.commissionPerUnit;
    },
  };
}
