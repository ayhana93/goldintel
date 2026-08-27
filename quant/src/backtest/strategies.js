// Strategy adapters for the backtester, plus the control baselines of Phase 26.
//
// A strategy is a pure function of the closed-bar state at one decision instant.
// It returns zero or more signals; the engine decides whether they can be filled.

import { detectSetups, baselineDecision, baselineScalpDecision } from '../core/setups.js';
import { buildPlan } from '../core/levels.js';

/** Reproduction of the production swing engine, as shipped. */
export function productionSwing(cfg = {}) {
  const { threshold = 70, stopPolicy = 'production', targetPolicy = 'production', minRR = 2, rrLeg = 'rr3' } = cfg;
  return ({ features, price, atr, levels }) => {
    const d = baselineDecision({ features, cfg: { threshold, weights: cfg.weights } });
    if (d.direction === 'NO_TRADE') return [];
    const plan = buildPlan({
      price, direction: d.direction, atr, volRatio: features.volRatio,
      swingLow: features.h1Struct?.lastSwingLow?.price,
      swingHigh: features.h1Struct?.lastSwingHigh?.price,
      levels, stopPolicy, targetPolicy,
      stopCfg: cfg.stopCfg ?? {}, targetCfg: cfg.targetCfg ?? {},
    });
    if (!plan || plan[rrLeg] < minRR) return [];
    return [{
      setupId: 'BASELINE_SWING', direction: d.direction, tier: 'swing', plan,
      evidenceLong: d.longScore, evidenceShort: d.shortScore, conflict: d.conflict,
    }];
  };
}

/** Reproduction of the production scalp tier. */
export function productionScalp(cfg = {}) {
  const { threshold = 58, minRR = 1, rrLeg = 'rr3' } = cfg;
  return ({ ctx, idx, features, price, levels }) => {
    const m15 = ctx.tf.M15;
    const atrM15 = idx.M15 >= 0 ? m15.ind.atr14[idx.M15] : null;
    const atr = atrM15 ?? (features.atrH1 != null ? features.atrH1 * 0.5 : null);
    if (!atr) return [];
    const d = baselineScalpDecision({ ctx, idx, features, cfg: { threshold, weights: cfg.weights } });
    if (d.direction === 'NO_TRADE') return [];
    const plan = buildPlan({
      price, direction: d.direction, atr, volRatio: features.volRatio,
      levels, stopPolicy: 'atr', targetPolicy: 'production',
      stopCfg: { atrMult: 0.8 },
    });
    if (!plan || plan[rrLeg] < minRR) return [];
    return [{
      setupId: 'BASELINE_SCALP', direction: d.direction, tier: 'scalp', plan,
      evidenceLong: d.longScore, evidenceShort: d.shortScore, conflict: d.conflict,
    }];
  };
}

/**
 * Named-setup strategy. `enabled` restricts which of A..H may fire; `filters`
 * applies the session / news / direction gates whose value Phases 13-15 test.
 */
export function setupStrategy(cfg = {}) {
  const {
    enabled = null, stopPolicy = 'structure_atr', targetPolicy = 'fixedR',
    stopCfg = {}, targetCfg = { rMultiples: [1, 2, 3] },
    minRR = 0, rrLeg = 'rr1',
    blockDirections = [], blockSessions = [], blockRegimes = [],
    setupCfg = {}, minEvidence = null, evidenceFn = null,
    // News filtering is deliberately independent of the news window the ENGINE
    // uses to widen spreads: costs around a release are a fact of the market,
    // whereas refusing to trade near one is a strategy choice being tested.
    newsFilter = null, newsBlockAheadHours = null, newsEvents = null,
  } = cfg;

  return ({ ctx, idx, features, levels, regime, price, atr, time }) => {
    if (newsFilter && newsFilter.contains(time)) return [];
    if (newsBlockAheadHours != null && newsEvents) {
      const mins = newsFilter
        ? newsFilter.minutesToNext(time, newsEvents)
        : minutesToNextEvent(newsEvents, time);
      if (mins <= newsBlockAheadHours * 60) return [];
    }
    const found = detectSetups({ ctx, idx, features, levels, cfg: setupCfg });
    const out = [];
    for (const s of found) {
      if (enabled && !enabled.includes(s.id)) continue;
      if (blockDirections.includes(s.direction)) continue;
      if (blockSessions.includes(regime.session)) continue;
      if (blockRegimes.includes(regime.regime)) continue;
      const plan = buildPlan({
        price, direction: s.direction, atr, volRatio: features.volRatio,
        swingLow: features.h1Struct?.lastSwingLow?.price,
        swingHigh: features.h1Struct?.lastSwingHigh?.price,
        levels, stopPolicy, targetPolicy, stopCfg, targetCfg,
      });
      if (!plan || plan[rrLeg] < minRR) continue;
      const ev = evidenceFn ? evidenceFn({ features }) : null;
      if (minEvidence != null && ev != null) {
        const score = s.direction === 'LONG' ? ev.longScore : ev.shortScore;
        if (score < minEvidence) continue;
      }
      out.push({
        setupId: s.id, direction: s.direction, tier: s.tier, plan,
        evidenceLong: ev?.longScore, evidenceShort: ev?.shortScore, conflict: ev?.conflict,
      });
    }
    return out;
  };
}

/** ---------------- Phase 26 control baselines ---------------- */

/** EMA 20/50 crossover on H1, long and short, same stop/target machinery. */
export function emaCrossBaseline(cfg = {}) {
  const { stopPolicy = 'atr', targetPolicy = 'fixedR', stopCfg = { atrMult: 1.5 }, targetCfg = { rMultiples: [1, 2, 3] } } = cfg;
  return ({ ctx, idx, price, atr, levels, features }) => {
    const h1 = ctx.tf.H1, i = idx.H1;
    if (i < 1) return [];
    const f = h1.ind.ema20, s = h1.ind.ema50;
    if (f[i] == null || s[i] == null || f[i - 1] == null || s[i - 1] == null) return [];
    let direction = null;
    if (f[i - 1] <= s[i - 1] && f[i] > s[i]) direction = 'LONG';
    if (f[i - 1] >= s[i - 1] && f[i] < s[i]) direction = 'SHORT';
    if (!direction) return [];
    const plan = buildPlan({ price, direction, atr, volRatio: features.volRatio, levels, stopPolicy, targetPolicy, stopCfg, targetCfg });
    return plan ? [{ setupId: 'CTRL_EMA_CROSS', direction, tier: 'swing', plan }] : [];
  };
}

/** Simple trend following: enter in the direction of the D1 EMA bias on a fresh 20-bar H1 breakout. */
export function trendFollowBaseline(cfg = {}) {
  const { window = 20, stopCfg = { atrMult: 1.5 }, targetCfg = { rMultiples: [1, 2, 3] } } = cfg;
  return ({ ctx, idx, price, atr, levels, features }) => {
    const h1 = ctx.tf.H1, i = idx.H1;
    if (i < window) return [];
    let hi = -Infinity, lo = Infinity;
    for (let k = i - window; k < i; k++) { hi = Math.max(hi, h1.candles[k].high); lo = Math.min(lo, h1.candles[k].low); }
    let direction = null;
    if (features.d1Bias === 'bullish' && price > hi) direction = 'LONG';
    if (features.d1Bias === 'bearish' && price < lo) direction = 'SHORT';
    if (!direction) return [];
    const plan = buildPlan({ price, direction, atr, volRatio: features.volRatio, levels, stopPolicy: 'atr', targetPolicy: 'fixedR', stopCfg, targetCfg });
    return plan ? [{ setupId: 'CTRL_TREND_FOLLOW', direction, tier: 'swing', plan }] : [];
  };
}

/**
 * Random-entry control with IDENTICAL risk and exit machinery. If the strategy
 * cannot beat this, its "edge" is the exit logic, not the entry logic.
 * Seeded so results are reproducible.
 */
export function randomEntryBaseline(cfg = {}) {
  const { probability = 0.01, seed = 42, stopCfg = { atrMult: 1.5 }, targetCfg = { rMultiples: [1, 2, 3] } } = cfg;
  let state = seed >>> 0;
  const rnd = () => {
    // xorshift32 — deterministic across runs and platforms
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
  return ({ price, atr, levels, features }) => {
    if (rnd() > probability) return [];
    const direction = rnd() < 0.5 ? 'LONG' : 'SHORT';
    const plan = buildPlan({ price, direction, atr, volRatio: features.volRatio, levels, stopPolicy: 'atr', targetPolicy: 'fixedR', stopCfg, targetCfg });
    return plan ? [{ setupId: 'CTRL_RANDOM', direction, tier: 'swing', plan }] : [];
  };
}

/**
 * Minutes until the next event at or after `t`. Binary search, so a filter that
 * runs on every bar of a decade does not become the cost of the study.
 */
export function minutesToNextEvent(events, t) {
  let lo = 0, hi = events.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].time >= t) { ans = mid; hi = mid - 1; }
    else lo = mid + 1;
  }
  return ans < 0 ? Infinity : (events[ans].time - t) / 60000;
}

/** Combine several strategies into one signal stream. */
export function combine(...fns) {
  return (args) => fns.flatMap((f) => f(args));
}
