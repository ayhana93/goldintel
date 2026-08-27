// Phase 21 — feature correlation and double counting.
//
// Six components each carry their own weight, which only makes sense if they
// carry their own information. If trend, structure and price action are three
// readings of the same needle, the score does not represent "six kinds of
// evidence agreeing" — it represents one fact counted three times, and the
// number it produces is confidently wrong rather than confidently right.

import { alignedIndices } from '../core/context.js';
import { buildFeatures } from '../core/evidence.js';
import { getLevels } from './engine.js';

export function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : null;
}

/**
 * Sample the feature vector across the period and return the correlation matrix
 * of the six scoring components, plus the future-return correlation of each
 * component (how much each actually predicts, measured on the same sample).
 */
export function featureCorrelation({ ctx, fromMs, toMs, stride = 6, horizonBars = 24, levelMaxSwings = 60 }) {
  const h1 = ctx.tf.H1;
  const cols = {
    trend: [], structure: [], momentum: [], support_resistance: [], price_action: [], macro: [],
  };
  const forward = [];

  for (let i = 0; i < h1.candles.length - horizonBars; i += stride) {
    const t = h1.candles[i].closeTime;
    if (t < fromMs || t > toMs) continue;
    const idx = { M15: -1, H1: i, H4: ctx.align.H1_H4?.[i] ?? -1, D1: ctx.align.H1_D1?.[i] ?? -1 };
    if (idx.D1 < 0 || idx.H4 < 0) continue;
    const atr = h1.ind.atr14[i];
    if (atr == null || !(atr > 0)) continue;
    const price = h1.candles[i].close;
    const levels = getLevels(ctx, idx, price, levelMaxSwings);
    const f = buildFeatures({ ctx, idx, price, levels });

    cols.trend.push(f.trendNet);
    cols.structure.push(f.structNet);
    cols.momentum.push(f.momentumNet);
    cols.support_resistance.push(f.srNet);
    cols.price_action.push(f.paNet);
    cols.macro.push(f.macroNet);
    // Forward return over the horizon, normalized by ATR so it is comparable
    // across a decade in which gold went from $1,200 to $2,000.
    forward.push((h1.candles[i + horizonBars].close - price) / atr);
  }

  const names = Object.keys(cols);
  const matrix = {};
  for (const a of names) {
    matrix[a] = {};
    for (const b of names) matrix[a][b] = a === b ? 1 : round(pearson(cols[a], cols[b]));
  }

  const predictive = {};
  for (const a of names) predictive[a] = round(pearson(cols[a], forward));

  // Pairs that are effectively the same measurement.
  const redundant = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const r = matrix[names[i]][names[j]];
      if (r != null && Math.abs(r) >= 0.6) redundant.push({ a: names[i], b: names[j], r });
    }
  }

  return {
    samples: forward.length,
    horizonBars,
    matrix,
    predictiveVsForwardReturn: predictive,
    redundantPairs: redundant.sort((x, y) => Math.abs(y.r) - Math.abs(x.r)),
  };
}

function round(x) {
  return x == null ? null : Math.round(x * 1000) / 1000;
}
