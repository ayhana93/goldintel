// Phase 18 — the data split, fixed before any result was examined.
//
// The archive available to this study runs 2012-05-15 → 2022-03-04. The brief
// asked for 2021-2024 training / 2025 validation / 2026 final test; no reachable
// source carries XAU/USD intraday data past March 2022, so the SAME protocol is
// applied to the period that does exist. The proportions are preserved.
//
//   DEVELOPMENT   2012-05-15 → 2018-12-31   (~67%)  every choice is made here
//   VALIDATION    2019-01-01 → 2020-12-31   (~20%)  checked repeatedly, never optimized on
//   FINAL TEST    2021-01-01 → 2022-03-04   (~13%)  opened once, at the very end
//
// The final period is not read by any selection routine in this repository.

export const PERIODS = {
  development: { from: Date.UTC(2012, 4, 15), to: Date.UTC(2018, 11, 31, 23, 59, 59) },
  validation: { from: Date.UTC(2019, 0, 1), to: Date.UTC(2020, 11, 31, 23, 59, 59) },
  finalTest: { from: Date.UTC(2021, 0, 1), to: Date.UTC(2022, 2, 4, 23, 59, 59) },
};

export const ALL = { from: PERIODS.development.from, to: PERIODS.finalTest.to };

/** Development + validation: everything the researcher is allowed to look at. */
export const OPEN_PERIOD = { from: PERIODS.development.from, to: PERIODS.validation.to };

export function label(p) {
  return `${new Date(p.from).toISOString().slice(0, 10)} → ${new Date(p.to).toISOString().slice(0, 10)}`;
}
