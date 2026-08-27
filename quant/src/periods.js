// Phase 18 — the data split, fixed before any result on the new data was examined.
//
// The previous split ran development 2012-2018, validation 2019-2020 and final
// test 2021-01 → 2022-03. That final test is now four years stale: gold traded
// near $1,970 at the end of it and near $4,600 in August 2026. A strategy
// validated only on pre-2022 data has not been tested on the regime it would
// actually be deployed into.
//
// Two feeds make a modern split possible (see docs/DATA_SOURCES.md):
//
//   DEVELOPMENT   2012-05-15 → 2019-12-31   legacy feed   every choice is made here
//   VALIDATION    2020-01-01 → 2022-12-31   modern feed   checked, never optimized on
//   FINAL TEST    2023-01-01 → 2025-12-31   modern feed   opened once, at the very end
//   FORWARD       2026-01-01 →              reserved for live paper trading only
//
// The feed boundary is placed exactly on the development/validation boundary so
// that no single period spans two feeds. The feeds overlap over
// 2020-01 → 2022-03, and that overlap is used to measure whether the change of
// feed — rather than the change of market — could be driving any conclusion:
// run `node quant/scripts/check-feeds.mjs`.

export const PERIODS = {
  development: { from: Date.UTC(2012, 4, 15), to: Date.UTC(2019, 11, 31, 23, 59, 59), feed: 'legacy' },
  validation: { from: Date.UTC(2020, 0, 1), to: Date.UTC(2022, 11, 31, 23, 59, 59), feed: 'modern' },
  finalTest: { from: Date.UTC(2023, 0, 1), to: Date.UTC(2025, 11, 31, 23, 59, 59), feed: 'modern' },
};

/** Everything after development: the only sample that can judge a choice made on development. */
export const OUT_OF_SAMPLE = { from: PERIODS.validation.from, to: PERIODS.finalTest.to, feed: 'modern' };

/** What the researcher is allowed to look at while choosing. */
export const OPEN_PERIOD = { from: PERIODS.development.from, to: PERIODS.validation.to };

/**
 * The window where both feeds carry data. Used only to compare the feeds with
 * each other, never as a study period in its own right.
 */
export const FEED_OVERLAP = { from: Date.UTC(2020, 0, 1), to: Date.UTC(2022, 2, 4) };

/**
 * March-October 2020. The two independent feeds correlate 0.31 on hourly returns
 * inside this window and 0.98 outside it: during the COVID liquidity crisis the
 * price of gold was genuinely broker-dependent by dollars. Results driven by this
 * window are feed-dependent and are reported separately rather than trusted.
 */
export const COVID_DISLOCATION = { from: Date.UTC(2020, 2, 1), to: Date.UTC(2020, 9, 31) };

export function label(p) {
  return `${new Date(p.from).toISOString().slice(0, 10)} → ${new Date(p.to).toISOString().slice(0, 10)}`;
}

export function feedFor(period) {
  return period.feed ?? 'modern';
}
