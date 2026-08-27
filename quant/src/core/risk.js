// Phase 20 — risk management.
//
// Position size comes from the stop distance, never from the score. The
// production PositionCalculator sizes from leverage and then reports the loss,
// which is the wrong way round (audit S3-9). Every rule here is enforced inside
// the backtest, so risk settings change measured results rather than being advice.

import { utcDateKey, utcWeekKey } from './time.js';

export const DEFAULT_RISK = {
  accountSize: 10_000,
  riskPerTradePct: 1.0,
  maxDailyLossPct: 3.0,
  maxWeeklyLossPct: 6.0,
  maxConcurrentTrades: 2,
  maxConsecutiveLosses: 4,
  cooldownHours: 24,
  compound: false,          // size off the starting balance unless asked otherwise
};

/** units = (equity * risk%) / stopDistance. Confidence never enters this. */
export function positionSize({ equity, riskPct, entry, stop }) {
  const dist = Math.abs(entry - stop);
  if (!(dist > 0)) return { units: 0, riskAmount: 0, stopDistance: 0 };
  const riskAmount = equity * (riskPct / 100);
  return { units: riskAmount / dist, riskAmount, stopDistance: dist };
}

/**
 * Stateful gatekeeper. `canOpen` is asked before every entry; `record` is called
 * with each realized P/L. All limits are evaluated against realized P/L only, so
 * an open position cannot trip a kill switch retroactively.
 */
export function makeRiskEngine(cfg = {}) {
  const c = { ...DEFAULT_RISK, ...cfg };
  const state = {
    equity: c.accountSize,
    peakEquity: c.accountSize,
    dayKey: null, dayPnl: 0,
    weekKey: null, weekPnl: 0,
    consecutiveLosses: 0,
    cooldownUntil: 0,
    openCount: 0,
    blocked: { daily: 0, weekly: 0, concurrent: 0, cooldown: 0 },
  };

  const roll = (t) => {
    const d = utcDateKey(t), w = utcWeekKey(t);
    if (state.dayKey !== d) { state.dayKey = d; state.dayPnl = 0; }
    if (state.weekKey !== w) { state.weekKey = w; state.weekPnl = 0; }
  };

  return {
    cfg: c,
    state,

    sizingEquity() {
      return c.compound ? state.equity : c.accountSize;
    },

    canOpen(t) {
      roll(t);
      if (state.openCount >= c.maxConcurrentTrades) { state.blocked.concurrent++; return { ok: false, reason: 'MAX_CONCURRENT' }; }
      if (t < state.cooldownUntil) { state.blocked.cooldown++; return { ok: false, reason: 'LOSS_COOLDOWN' }; }
      const dayLimit = -c.accountSize * (c.maxDailyLossPct / 100);
      if (state.dayPnl <= dayLimit) { state.blocked.daily++; return { ok: false, reason: 'DAILY_KILL_SWITCH' }; }
      const weekLimit = -c.accountSize * (c.maxWeeklyLossPct / 100);
      if (state.weekPnl <= weekLimit) { state.blocked.weekly++; return { ok: false, reason: 'WEEKLY_KILL_SWITCH' }; }
      return { ok: true };
    },

    opened() { state.openCount++; },

    /** @param pnl realized P/L in account currency, net of costs */
    record(t, pnl) {
      roll(t);
      state.openCount = Math.max(0, state.openCount - 1);
      state.equity += pnl;
      state.peakEquity = Math.max(state.peakEquity, state.equity);
      state.dayPnl += pnl;
      state.weekPnl += pnl;
      if (pnl < 0) {
        state.consecutiveLosses++;
        if (state.consecutiveLosses >= c.maxConsecutiveLosses) {
          state.cooldownUntil = t + c.cooldownHours * 3600_000;
          state.consecutiveLosses = 0;
        }
      } else if (pnl > 0) {
        state.consecutiveLosses = 0;
      }
    },
  };
}
