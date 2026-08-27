// Phase 4 — the backtesting engine.
//
// Replays the market bar by bar. The only prices it may consult when making a
// decision are those of bars that had already CLOSED at that instant; the only
// prices it may consult when resolving a trade are those of bars at or after the
// entry. Nothing computes an outcome before the trade exists.
//
// Structural guarantees:
//   * decisions are taken at a bar CLOSE and executed at the OPEN of a later bar
//     (entryDelayBars >= 1), so the decision bar itself can never be the fill bar
//   * higher-timeframe state comes from precomputed alignment maps built with
//     alignIndex(), which resolve "newest bar whose closeTime <= this instant"
//   * swings are only visible after their confirmation bar
//   * when a bar contains both the stop and a target, the STOP is taken
//     (adverse-first). Real intrabar order is unknowable at this resolution and
//     the pessimistic reading is the only defensible one.

import { alignedIndices } from '../core/context.js';
import { findLevelsAt } from '../core/structure.js';
import { buildFeatures } from '../core/evidence.js';
import { classifyRegime } from '../core/regime.js';
import { buildPlan } from '../core/levels.js';
import { makeExecutionModel } from '../core/execution.js';
import { makeRiskEngine, positionSize } from '../core/risk.js';
import { sessionOf, sessionOpenHour, utcDayOfWeek, utcHour, HOUR } from '../core/time.js';

export const DEFAULT_BACKTEST = {
  tp1Fraction: 0.5,
  tp2Fraction: 0.25,
  moveStopToBreakevenAfterTp1: true,
  maxHoldBarsSwing: 96,       // 96 H1-equivalents = 4 days for swing trades
  maxHoldBarsScalp: 24,       // 24 M15 bars = 6 hours
  entryDelayBars: 1,          // in driver (M15) bars
  oneOpenPerSetup: true,
  levelMaxSwings: 60,
};

let TRADE_SEQ = 0;

/**
 * @param {object} o
 * @param {object} o.ctx        precomputed context (buildContext)
 * @param {function} o.strategy ({ ctx, idx, features, levels, regime, bar, tier }) => signal[]
 * @param {object} o.execution  scenario name or model
 * @param {object} o.risk       risk engine config
 * @param {object} o.newsWindow makeNewsWindow(...) or null
 * @param {number} o.fromMs     inclusive replay start (decisions only)
 * @param {number} o.toMs       inclusive replay end
 */
export function runBacktest({
  ctx, strategy, execution = 'realistic', risk = {}, newsWindow = null,
  fromMs = -Infinity, toMs = Infinity, options = {},
}) {
  const opt = { ...DEFAULT_BACKTEST, ...options };
  const exec = typeof execution === 'string' ? makeExecutionModel(execution) : execution;
  const riskEngine = makeRiskEngine(risk);

  const m15 = ctx.tf.M15;
  const h1 = ctx.tf.H1;
  if (!m15) throw new Error('The backtester needs an M15 driver series for intrabar resolution.');
  const driver = m15.candles;
  const alignH1 = ctx.align.M15_H1;

  const open = [];          // live positions
  const pending = [];       // signals waiting for their delayed fill
  const trades = [];
  const openSetups = new Set();
  const skipped = { risk: 0, noPlan: 0, duplicate: 0, expired: 0 };
  const equityCurve = [];

  let lastH1Decided = -1;

  const inNewsAt = (t) => (newsWindow ? newsWindow.contains(t) : false);

  for (let j = 0; j < driver.length; j++) {
    const bar = driver[j];

    // ---------- 1. fill anything scheduled for this bar's open ----------
    for (let k = pending.length - 1; k >= 0; k--) {
      const p = pending[k];
      if (p.fillIndex !== j) continue;
      pending.splice(k, 1);

      const news = inNewsAt(bar.openTime);
      const fill = exec.entryFill(bar.open, p.direction, news);
      // The stop is a price level, not a distance: re-derive risk from the fill.
      const stopDistance = Math.abs(fill - p.plan.sl);
      if (!(stopDistance > 0)) { skipped.noPlan++; continue; }

      const gate = riskEngine.canOpen(bar.openTime);
      if (!gate.ok) { skipped.risk++; continue; }

      const { units, riskAmount } = positionSize({
        equity: riskEngine.sizingEquity(),
        riskPct: riskEngine.cfg.riskPerTradePct,
        entry: fill, stop: p.plan.sl,
      });
      if (!(units > 0)) { skipped.noPlan++; continue; }

      riskEngine.opened();
      if (opt.oneOpenPerSetup) openSetups.add(`${p.setupId}|${p.direction}`);

      open.push({
        id: ++TRADE_SEQ,
        setupId: p.setupId, direction: p.direction, tier: p.tier,
        signalTime: p.signalTime, signalIndex: p.signalIndex,
        entryTime: bar.openTime, entryIndex: j,
        entryMid: bar.open, entryFill: fill,
        sl: p.plan.sl, originalSl: p.plan.sl,
        tp1: p.plan.tp1, tp2: p.plan.tp2, tp3: p.plan.tp3,
        risk: stopDistance, plannedRisk: p.plan.risk,
        rr1: Math.abs(p.plan.tp1 - fill) / stopDistance,
        rr2: Math.abs(p.plan.tp2 - fill) / stopDistance,
        rr3: Math.abs(p.plan.tp3 - fill) / stopDistance,
        units, unitsOpen: units, riskAmount,
        costs: exec.commission(units),
        realizedPnl: 0,
        exits: [],
        tp1Hit: false, tp2Hit: false, tp3Hit: false,
        mae: 0, mfe: 0,
        maxHoldBars: p.maxHoldBars,
        meta: p.meta,
      });
    }

    // ---------- 2. manage open positions against this bar ----------
    for (let k = open.length - 1; k >= 0; k--) {
      const t = open[k];
      if (j < t.entryIndex) continue;   // resolve from the fill bar onward, never before
      const news = inNewsAt(bar.openTime);

      // MAE / MFE on mid prices, in R
      const adverse = t.direction === 'LONG' ? (t.entryFill - bar.low) : (bar.high - t.entryFill);
      const favorable = t.direction === 'LONG' ? (bar.high - t.entryFill) : (t.entryFill - bar.low);
      t.mae = Math.max(t.mae, adverse / t.risk);
      t.mfe = Math.max(t.mfe, favorable / t.risk);

      // 2a. stop first — adverse-first convention
      const stopPrice = exec.stopHit(bar, t.direction, t.sl, news);
      if (stopPrice != null) {
        closeUnits(t, t.unitsOpen, stopPrice, bar.closeTime, t.tp1Hit ? 'STOP_AFTER_TP1' : 'STOP');
        finish(t, k);
        continue;
      }

      // 2b. targets in order
      if (!t.tp1Hit) {
        const px = exec.targetHit(bar, t.direction, t.tp1, news);
        if (px != null) {
          t.tp1Hit = true;
          closeUnits(t, t.units * opt.tp1Fraction, px, bar.closeTime, 'TP1');
          if (opt.moveStopToBreakevenAfterTp1) t.sl = t.entryFill;
        }
      }
      if (t.tp1Hit && !t.tp2Hit && t.unitsOpen > 0) {
        const px = exec.targetHit(bar, t.direction, t.tp2, news);
        if (px != null) {
          t.tp2Hit = true;
          closeUnits(t, t.units * opt.tp2Fraction, px, bar.closeTime, 'TP2');
        }
      }
      if (t.tp2Hit && !t.tp3Hit && t.unitsOpen > 0) {
        const px = exec.targetHit(bar, t.direction, t.tp3, news);
        if (px != null) {
          t.tp3Hit = true;
          closeUnits(t, t.unitsOpen, px, bar.closeTime, 'TP3');
          finish(t, k);
          continue;
        }
      }
      if (t.unitsOpen <= 1e-12) { finish(t, k); continue; }

      // 2c. time stop
      if (j - t.entryIndex >= t.maxHoldBars) {
        closeUnits(t, t.unitsOpen, exec.exitFill(bar.close, t.direction, news), bar.closeTime, 'TIME_EXIT');
        finish(t, k);
      }
    }

    // ---------- 3. expire unfilled signals ----------
    for (let k = pending.length - 1; k >= 0; k--) {
      if (pending[k].fillIndex < j) { pending.splice(k, 1); skipped.expired++; }
    }

    // ---------- 4. take decisions at the close of this bar ----------
    const t = bar.closeTime;
    if (t < fromMs || t > toMs) continue;

    const iH1 = alignH1[j];
    // A swing decision may only be taken on a bar that is simultaneously an H1
    // close; otherwise the H1 bar it would read is still forming.
    const isH1Close = iH1 >= 0 && h1.candles[iH1].closeTime === t && iH1 !== lastH1Decided;
    if (!isH1Close) continue;
    lastH1Decided = iH1;
    if (j + opt.entryDelayBars >= driver.length) continue;

    const idx = alignedIndices(ctx, 'M15', j);
    if (idx.H1 < 0 || idx.D1 < 0) continue;

    const price = h1.candles[idx.H1].close;
    const atr = h1.ind.atr14[idx.H1];
    if (atr == null || !(atr > 0)) continue;

    const levels = getLevels(ctx, idx, price, opt.levelMaxSwings);

    const features = buildFeatures({ ctx, idx, price, levels, cfg: options.featureCfg });
    const news = inNewsAt(t);
    const regime = classifyRegime({
      biases: { D1: features.d1Bias, H4: features.h4Bias, H1: features.h1Bias },
      structs: { D1: features.d1Struct, H4: features.h4Struct, H1: features.h1Struct },
      volRatio: features.volRatio,
      inNews: news,
    });

    const signals = strategy({ ctx, idx, features, levels, regime, price, atr, bar, time: t, inNews: news });
    for (const sig of signals) {
      // Mirrors the production spam guard: at most one live position per setup
      // and direction. A LONG does not block a SHORT.
      if (opt.oneOpenPerSetup && openSetups.has(`${sig.setupId}|${sig.direction}`)) { skipped.duplicate++; continue; }
      const plan = sig.plan ?? buildPlan({
        price, direction: sig.direction, atr, volRatio: features.volRatio,
        swingLow: features.h1Struct?.lastSwingLow?.price,
        swingHigh: features.h1Struct?.lastSwingHigh?.price,
        levels,
        stopPolicy: sig.stopPolicy, targetPolicy: sig.targetPolicy,
        stopCfg: sig.stopCfg, targetCfg: sig.targetCfg,
      });
      if (!plan) { skipped.noPlan++; continue; }
      pending.push({
        setupId: sig.setupId, direction: sig.direction, tier: sig.tier ?? 'swing',
        plan, signalTime: t, signalIndex: j,
        fillIndex: j + opt.entryDelayBars,
        maxHoldBars: sig.tier === 'scalp' ? opt.maxHoldBarsScalp : opt.maxHoldBarsSwing * 4,
        meta: {
          regime: regime.regime, volState: regime.volState, volRatio: regime.volRatio,
          inNews: news, session: sessionOf(t), sessionOpen: sessionOpenHour(t),
          hour: utcHour(t), dayOfWeek: utcDayOfWeek(t),
          evidenceLong: sig.evidenceLong, evidenceShort: sig.evidenceShort,
          conflict: sig.conflict, direction: sig.direction,
          rr1: plan.rr1, rr2: plan.rr2, rr3: plan.rr3,
          atr, price,
        },
      });
    }
  }

  // Force-close anything still open at the end of the replay, at the last mid.
  const lastBar = driver[driver.length - 1];
  for (let k = open.length - 1; k >= 0; k--) {
    const t = open[k];
    closeUnits(t, t.unitsOpen, exec.exitFill(lastBar.close, t.direction, false), lastBar.closeTime, 'END_OF_DATA');
    finish(t, k);
  }

  trades.sort((a, b) => a.entryTime - b.entryTime);
  return {
    trades, skipped, equityCurve,
    execution: { name: exec.name, cfg: exec.cfg },
    risk: { cfg: riskEngine.cfg, blocked: riskEngine.state.blocked, finalEquity: riskEngine.state.equity },
  };

  // ---------------- helpers ----------------

  function closeUnits(t, units, price, time, reason) {
    const u = Math.min(units, t.unitsOpen);
    if (u <= 0) return;
    const sign = t.direction === 'LONG' ? 1 : -1;
    const gross = sign * (price - t.entryFill) * u;
    const commission = exec.commission(u);
    t.realizedPnl += gross - commission;
    t.costs += commission;
    t.unitsOpen -= u;
    t.exits.push({ time, price, units: u, fraction: u / t.units, reason });
  }

  function finish(t, k) {
    open.splice(k, 1);
    if (opt.oneOpenPerSetup) openSetups.delete(`${t.setupId}|${t.direction}`);
    t.exitTime = t.exits.length ? t.exits[t.exits.length - 1].time : t.entryTime;
    t.exitReason = t.exits.length ? t.exits[t.exits.length - 1].reason : 'NONE';
    t.holdingHours = (t.exitTime - t.entryTime) / HOUR;
    t.rMultiple = t.riskAmount > 0 ? t.realizedPnl / t.riskAmount : 0;
    t.session = t.meta.session;
    t.regime = t.meta.regime;
    riskEngine.record(t.exitTime, t.realizedPnl);
    t.equityAfter = riskEngine.state.equity;
    equityCurve.push({ time: t.exitTime, equity: t.equityAfter, r: t.rMultiple });
    trades.push(t);
  }
}

/**
 * The most recent `limit` swings of a timeframe that were CONFIRMED at or before
 * bar i. Binary search plus a bounded slice, so cost does not grow with history
 * and a swing from the future is unreachable by construction.
 */
export function swingsUpTo(tfCtx, i, limit = Infinity) {
  const tl = tfCtx.timeline;
  let lo = 0, hi = tl.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tl[mid].confirmedIndex <= i) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  if (ans < 0) return [];
  const from = Number.isFinite(limit) ? Math.max(0, ans + 1 - limit) : 0;
  return tl.slice(from, ans + 1);
}

/**
 * Support/resistance for one H1 bar, memoized on the context.
 *
 * Levels depend only on the H1 index (which fixes the price and the confirmed
 * swing set) and the aligned D1 index, so the same bar always yields the same
 * levels. Caching makes walk-forward and sensitivity sweeps cheap without
 * changing a single value.
 */
export function getLevels(ctx, idx, price, maxSwings) {
  if (!ctx._levelCache) ctx._levelCache = new Map();
  const key = idx.H1;
  const hit = ctx._levelCache.get(key);
  if (hit) return hit;
  const levels = findLevelsAt({
    h1Candles: ctx.tf.H1.candles,
    h1Swings: swingsUpTo(ctx.tf.H1, idx.H1, maxSwings),
    d1Candles: ctx.tf.D1.candles,
    d1Swings: swingsUpTo(ctx.tf.D1, idx.D1, Math.round(maxSwings / 2)),
    d1Index: idx.D1,
    price,
    maxSwings,
  });
  ctx._levelCache.set(key, levels);
  return levels;
}
