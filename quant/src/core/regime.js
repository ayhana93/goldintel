// Phase 7 — regime classification.
//
// The original classifier collapsed both pullback directions into one "PULLBACK"
// label and let volatility pre-empt trend, so a trending market simply
// disappeared from the statistics whenever ATR expanded. Here the primary label
// is direction-first and volatility is reported as an orthogonal flag, so the
// question "which strategy works under which conditions" can actually be
// cross-tabulated instead of being answered by whichever branch fired first.

export const REGIMES = [
  'TRENDING_BULLISH', 'TRENDING_BEARISH',
  'PULLBACK_BULLISH', 'PULLBACK_BEARISH',
  'RANGE', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'NEWS_EVENT', 'UNCERTAIN',
];

export const VOL_STATES = ['HIGH', 'NORMAL', 'LOW'];

/**
 * @param biases   { D1, H4, H1 } EMA biases at the aligned closed bars
 * @param structs  { D1, H4, H1 } structure objects at those bars
 * @param volRatio ATR(H1) / mean(ATR(H1), 60)
 * @param inNews   whether the instant sits inside a high-impact release window
 * @param cfg      thresholds
 */
export function classifyRegime({ biases, structs, volRatio, inNews = false, cfg = {} }) {
  const { volHigh = 1.5, volLow = 0.65 } = cfg;
  const volState = volRatio == null ? 'NORMAL' : volRatio > volHigh ? 'HIGH' : volRatio < volLow ? 'LOW' : 'NORMAL';

  const { D1, H4, H1 } = biases;
  const d1Struct = structs.D1?.bias;

  let primary = 'UNCERTAIN';
  if (D1 === 'bullish' && H4 === 'bullish' && H1 === 'bullish') primary = 'TRENDING_BULLISH';
  else if (D1 === 'bearish' && H4 === 'bearish' && H1 === 'bearish') primary = 'TRENDING_BEARISH';
  else if (D1 === 'bullish' && (H1 === 'bearish' || H1 === 'neutral')) primary = 'PULLBACK_BULLISH';
  else if (D1 === 'bearish' && (H1 === 'bullish' || H1 === 'neutral')) primary = 'PULLBACK_BEARISH';
  else if (D1 === 'neutral' && H4 === 'neutral' && H1 === 'neutral') primary = 'RANGE';
  else if (H4 === 'neutral' && H1 === 'neutral' && (d1Struct === 'neutral' || d1Struct == null)) primary = 'RANGE';

  // Volatility and news only *win* the primary label when direction is unclear;
  // otherwise they are reported alongside it.
  if (primary === 'UNCERTAIN' || primary === 'RANGE') {
    if (inNews) primary = 'NEWS_EVENT';
    else if (volState === 'HIGH') primary = 'HIGH_VOLATILITY';
    else if (volState === 'LOW' && primary === 'UNCERTAIN') primary = 'LOW_VOLATILITY';
  }

  return { regime: primary, volState, volRatio, inNews };
}
