// Precomputed, causal, multi-timeframe context.
//
// Everything here is computed forward in one pass so that the value stored at
// index i is a function of bars 0..i only. The backtester then reads index i
// directly; it never gets the chance to scan forward.

import { computeIndicators, rollingMeanAt } from './indicators.js';
import { buildSwingTimeline, makeSwingCursor, classifyStructureAt, emaTrendBiasAt } from './structure.js';
import { alignIndex } from './candles.js';

/** Per-timeframe causal feature arrays. */
export function buildTimeframeContext(series, { swingLookback = 3, indicatorParams = {} } = {}) {
  const candles = series.candles;
  const ind = computeIndicators(candles, indicatorParams);
  const timeline = buildSwingTimeline(candles, swingLookback);
  const cursor = makeSwingCursor(timeline);

  const emaBias = new Array(candles.length);
  const struct = new Array(candles.length);
  for (let i = 0; i < candles.length; i++) {
    emaBias[i] = emaTrendBiasAt(candles, ind, i);
    struct[i] = classifyStructureAt(candles, i, cursor.knownAt(i));
  }
  return { timeframe: series.timeframe, series, candles, ind, timeline, emaBias, struct, swingLookback };
}

/**
 * Volatility state as of bar i: current ATR relative to its own recent mean.
 * Uses only closed bars up to i.
 */
export function volRatioAt(tfCtx, i, window = 60) {
  const a = tfCtx.ind.atr14[i];
  if (a == null) return null;
  const mean = rollingMeanAt(tfCtx.ind.atr14, i, window);
  return mean ? a / mean : null;
}

/**
 * Build the full context the strategy sees.
 *
 * `driver` is the timeframe the backtest steps on. Alignment maps answer, for
 * each driver bar, which higher-timeframe bar had *already closed* by then.
 */
export function buildContext({ m15, h1, h4, d1, macro = {}, options = {} }) {
  const { swingLookback = 3, indicatorParams = {} } = options;
  const tf = {
    M15: m15 ? buildTimeframeContext(m15, { swingLookback, indicatorParams }) : null,
    H1: buildTimeframeContext(h1, { swingLookback, indicatorParams }),
    H4: h4 ? buildTimeframeContext(h4, { swingLookback, indicatorParams }) : null,
    D1: d1 ? buildTimeframeContext(d1, { swingLookback, indicatorParams }) : null,
  };

  const align = {};
  if (tf.M15) {
    align.M15_H1 = alignIndex(tf.M15.candles, tf.H1.candles);
    if (tf.H4) align.M15_H4 = alignIndex(tf.M15.candles, tf.H4.candles);
    if (tf.D1) align.M15_D1 = alignIndex(tf.M15.candles, tf.D1.candles);
  }
  if (tf.H4) align.H1_H4 = alignIndex(tf.H1.candles, tf.H4.candles);
  if (tf.D1) align.H1_D1 = alignIndex(tf.H1.candles, tf.D1.candles);

  const macroCtx = {};
  for (const [name, series] of Object.entries(macro)) {
    if (!series) continue;
    macroCtx[name] = { series, candles: series.candles };
    if (tf.M15) macroCtx[name].fromM15 = alignIndex(tf.M15.candles, series.candles);
    macroCtx[name].fromH1 = alignIndex(tf.H1.candles, series.candles);
  }

  return { tf, align, macro: macroCtx, options: { swingLookback, indicatorParams } };
}

/**
 * Snapshot of every higher-timeframe index that was closed at driver bar i.
 * Returns null when any required timeframe has no closed bar yet.
 */
export function alignedIndices(ctx, driverTf, i) {
  if (driverTf === 'M15') {
    const h1 = ctx.align.M15_H1?.[i] ?? -1;
    const h4 = ctx.align.M15_H4?.[i] ?? -1;
    const d1 = ctx.align.M15_D1?.[i] ?? -1;
    return { M15: i, H1: h1, H4: h4, D1: d1 };
  }
  if (driverTf === 'H1') {
    return { M15: -1, H1: i, H4: ctx.align.H1_H4?.[i] ?? -1, D1: ctx.align.H1_D1?.[i] ?? -1 };
  }
  throw new Error(`Unsupported driver timeframe: ${driverTf}`);
}
