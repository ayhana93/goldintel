// Phase 30 — the simulated execution model used for paper trading.
//
// Identical assumptions to the backtest's "realistic" scenario, so paper results
// and backtested expectations are measured on the same scale. Candles are mid
// prices: a buyer pays the ask, a seller receives the bid, and a stop only
// triggers when the side of the book that would close the position reaches it.
//
// Keep in sync with src/lib/paperExecution.js — quant/test/mirror.test.js enforces it.

export const PAPER_EXECUTION = {
  spread: 0.30,
  slippage: 0.10,
  commissionPerUnit: 0.035,
  newsSpreadMultiplier: 3,
};

export const PAPER_RISK = {
  accountSize: 10000,
  riskPerTradePct: 1,
  maxConcurrentTrades: 2,
  maxDailyLossPct: 3,
  maxWeeklyLossPct: 6,
};

const half = (inNews, cfg) => (cfg.spread * (inNews ? cfg.newsSpreadMultiplier : 1)) / 2;

export function entryFill(mid, direction, inNews = false, cfg = PAPER_EXECUTION) {
  const h = half(inNews, cfg);
  return direction === 'LONG' ? mid + h + cfg.slippage : mid - h - cfg.slippage;
}

export function exitFill(mid, direction, inNews = false, cfg = PAPER_EXECUTION) {
  const h = half(inNews, cfg);
  return direction === 'LONG' ? mid - h - cfg.slippage : mid + h + cfg.slippage;
}

export function stopHit(bar, direction, sl, inNews = false, cfg = PAPER_EXECUTION) {
  const h = half(inNews, cfg);
  if (direction === 'LONG') return bar.low <= sl + h ? sl - cfg.slippage : null;
  return bar.high >= sl - h ? sl + cfg.slippage : null;
}

export function targetHit(bar, direction, tp, inNews = false, cfg = PAPER_EXECUTION) {
  const h = half(inNews, cfg);
  if (direction === 'LONG') return bar.high >= tp + h ? tp : null;
  return bar.low <= tp - h ? tp : null;
}

/** Position size from the stop distance. The evidence score never enters this. */
export function positionSize({ accountSize, riskPct, entry, stop }) {
  const dist = Math.abs(entry - stop);
  if (!(dist > 0)) return { units: 0, riskAmount: 0, stopDistance: 0 };
  const riskAmount = accountSize * (riskPct / 100);
  return { units: riskAmount / dist, riskAmount, stopDistance: dist };
}

/**
 * Walk an open paper trade forward through closed candles and resolve it.
 *
 * Same conventions as the backtester: partial exits of 50% at TP1 and 25% at TP2,
 * stop to breakeven after TP1, and when a bar contains both the stop and a
 * target the STOP is taken. Real intrabar order is unknowable at this
 * resolution and the pessimistic reading is the only defensible one.
 */
export function resolvePaperTrade(trade, candles, { tp1Fraction = 0.5, tp2Fraction = 0.25, maxHoldBars = 384 } = {}) {
  const dir = trade.direction;
  const entry = trade.entry_price;
  const risk = trade.risk_price;
  const units = trade.units;
  if (!(risk > 0) || !(units > 0)) return null;

  const state = {
    sl: trade.stop_loss,
    tp1Hit: !!trade.tp1_hit, tp2Hit: !!trade.tp2_hit, tp3Hit: !!trade.tp3_hit,
    unitsOpen: units * (1 - (trade.tp1_hit ? tp1Fraction : 0) - (trade.tp2_hit ? tp2Fraction : 0)),
    pnl: trade.realized_pnl ?? 0,
    mae: trade.mae_r ?? 0,
    mfe: trade.mfe_r ?? 0,
    exits: [],
    closed: false,
    exitReason: null,
    exitPrice: null,
    exitTime: null,
  };
  if (state.tp1Hit) state.sl = entry;

  const sign = dir === 'LONG' ? 1 : -1;
  const close = (u, price, time, reason) => {
    const q = Math.min(u, state.unitsOpen);
    if (q <= 0) return;
    state.pnl += sign * (price - entry) * q - q * PAPER_EXECUTION.commissionPerUnit;
    state.unitsOpen -= q;
    state.exits.push({ price, time, units: q, reason });
    state.exitPrice = price;
    state.exitTime = time;
    state.exitReason = reason;
  };

  let bars = 0;
  for (const bar of candles) {
    bars++;
    const adverse = dir === 'LONG' ? entry - bar.low : bar.high - entry;
    const favorable = dir === 'LONG' ? bar.high - entry : entry - bar.low;
    state.mae = Math.max(state.mae, adverse / risk);
    state.mfe = Math.max(state.mfe, favorable / risk);

    const sp = stopHit(bar, dir, state.sl);
    if (sp != null) {
      close(state.unitsOpen, sp, bar.closeTime, state.tp1Hit ? 'STOP_AFTER_TP1' : 'STOP');
      state.closed = true;
      break;
    }
    if (!state.tp1Hit) {
      const px = targetHit(bar, dir, trade.tp1);
      if (px != null) { state.tp1Hit = true; close(units * tp1Fraction, px, bar.closeTime, 'TP1'); state.sl = entry; }
    }
    if (state.tp1Hit && !state.tp2Hit && state.unitsOpen > 0) {
      const px = targetHit(bar, dir, trade.tp2);
      if (px != null) { state.tp2Hit = true; close(units * tp2Fraction, px, bar.closeTime, 'TP2'); }
    }
    if (state.tp2Hit && !state.tp3Hit && state.unitsOpen > 0) {
      const px = targetHit(bar, dir, trade.tp3);
      if (px != null) { state.tp3Hit = true; close(state.unitsOpen, px, bar.closeTime, 'TP3'); state.closed = true; break; }
    }
    if (state.unitsOpen <= 1e-12) { state.closed = true; break; }
    if (bars >= maxHoldBars) {
      close(state.unitsOpen, exitFill(bar.close, dir), bar.closeTime, 'TIME_EXIT');
      state.closed = true;
      break;
    }
  }

  return {
    closed: state.closed,
    tp1Hit: state.tp1Hit, tp2Hit: state.tp2Hit, tp3Hit: state.tp3Hit,
    mae: state.mae, mfe: state.mfe,
    realizedPnl: state.pnl,
    realizedR: trade.risk_amount > 0 ? state.pnl / trade.risk_amount : null,
    exitPrice: state.exitPrice, exitTime: state.exitTime, exitReason: state.exitReason,
    unitsOpen: state.unitsOpen,
  };
}
