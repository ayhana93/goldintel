// Phase 13 — deterministic economic calendar.
//
// The production app asks an LLM for event timestamps and stores the answer as
// fact (audit S1-4). An LLM may explain what CPI is; it must not decide when CPI
// was released. This module derives event times from published, rule-based
// schedules and from curated tables, and labels every event with the precision
// of its timestamp so studies can exclude anything that is not exact.
//
//   precision: 'exact'       release rule is fixed by the agency (NFP, claims) or curated
//   precision: 'approximate' month is certain, day inferred from the usual pattern
//
// Only 'exact' events are used by the news-filter study.

import { DAY, HOUR, MINUTE } from './time.js';

/** US DST: second Sunday of March 07:00 UTC to first Sunday of November 06:00 UTC. */
export function isUsDst(utcMs) {
  const y = new Date(utcMs).getUTCFullYear();
  const nth = (month, dow, n) => {
    const d = new Date(Date.UTC(y, month, 1));
    let count = 0;
    while (true) {
      if (d.getUTCDay() === dow && ++count === n) return d.getTime();
      d.setUTCDate(d.getUTCDate() + 1);
    }
  };
  const start = nth(2, 0, 2) + 7 * HOUR;
  const end = nth(10, 0, 1) + 6 * HOUR;
  return utcMs >= start && utcMs < end;
}

/** Convert a US Eastern wall-clock release time on a given UTC date to UTC ms. */
export function easternToUtc(year, monthIndex, day, hh, mm) {
  const guess = Date.UTC(year, monthIndex, day, hh + 5, mm); // assume EST first
  return isUsDst(guess) ? guess - HOUR : guess;
}

function nthWeekdayOfMonth(year, monthIndex, dow, n) {
  const d = new Date(Date.UTC(year, monthIndex, 1));
  let count = 0;
  while (d.getUTCMonth() === monthIndex) {
    if (d.getUTCDay() === dow && ++count === n) return d.getUTCDate();
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return null;
}

/**
 * FOMC statement release dates (second day of each meeting), 2012-2022.
 * Curated from the Federal Reserve's published calendars; statements are
 * released at 14:00 Eastern. Unscheduled/emergency meetings are included where
 * they produced a statement, since they move gold hardest.
 */
export const FOMC_STATEMENT_DATES = [
  '2012-01-25', '2012-03-13', '2012-04-25', '2012-06-20', '2012-08-01', '2012-09-13', '2012-10-24', '2012-12-12',
  '2013-01-30', '2013-03-20', '2013-05-01', '2013-06-19', '2013-07-31', '2013-09-18', '2013-10-30', '2013-12-18',
  '2014-01-29', '2014-03-19', '2014-04-30', '2014-06-18', '2014-07-30', '2014-09-17', '2014-10-29', '2014-12-17',
  '2015-01-28', '2015-03-18', '2015-04-29', '2015-06-17', '2015-07-29', '2015-09-17', '2015-10-28', '2015-12-16',
  '2016-01-27', '2016-03-16', '2016-04-27', '2016-06-15', '2016-07-27', '2016-09-21', '2016-11-02', '2016-12-14',
  '2017-02-01', '2017-03-15', '2017-05-03', '2017-06-14', '2017-07-26', '2017-09-20', '2017-11-01', '2017-12-13',
  '2018-01-31', '2018-03-21', '2018-05-02', '2018-06-13', '2018-08-01', '2018-09-26', '2018-11-08', '2018-12-19',
  '2019-01-30', '2019-03-20', '2019-05-01', '2019-06-19', '2019-07-31', '2019-09-18', '2019-10-30', '2019-12-11',
  '2020-01-29', '2020-03-03', '2020-03-15', '2020-04-29', '2020-06-10', '2020-07-29', '2020-09-16', '2020-11-05', '2020-12-16',
  '2021-01-27', '2021-03-17', '2021-04-28', '2021-06-16', '2021-07-28', '2021-09-22', '2021-11-03', '2021-12-15',
  '2022-01-26', '2022-03-16', '2022-05-04', '2022-06-15', '2022-07-27', '2022-09-21', '2022-11-02', '2022-12-14',
];

/**
 * Build every scheduled event between two instants.
 *
 * Rule-based, exact:
 *   NFP              first Friday, 08:30 ET
 *   Jobless claims   every Thursday, 08:30 ET
 *   FOMC statement   curated table, 14:00 ET
 *
 * Rule-based, approximate (month certain, day inferred — excluded from the
 * filter study, kept so the UI can still warn):
 *   CPI              ~13th, 08:30 ET
 *   PPI              ~14th, 08:30 ET
 *   Retail sales     ~15th, 08:30 ET
 */
export function buildCalendar(fromMs, toMs) {
  const events = [];
  const push = (utcMs, name, importance, precision) => {
    if (utcMs >= fromMs && utcMs <= toMs) events.push({ time: utcMs, name, importance, precision });
  };

  const start = new Date(fromMs), end = new Date(toMs);
  for (let y = start.getUTCFullYear(); y <= end.getUTCFullYear(); y++) {
    for (let m = 0; m < 12; m++) {
      const nfpDay = nthWeekdayOfMonth(y, m, 5, 1);
      if (nfpDay) push(easternToUtc(y, m, nfpDay, 8, 30), 'Non-Farm Payrolls', 'high', 'exact');
      push(easternToUtc(y, m, 13, 8, 30), 'CPI', 'high', 'approximate');
      push(easternToUtc(y, m, 14, 8, 30), 'PPI', 'medium', 'approximate');
      push(easternToUtc(y, m, 15, 8, 30), 'Retail Sales', 'medium', 'approximate');
      // Weekly jobless claims: every Thursday of the month.
      for (let n = 1; n <= 5; n++) {
        const d = nthWeekdayOfMonth(y, m, 4, n);
        if (d) push(easternToUtc(y, m, d, 8, 30), 'Initial Jobless Claims', 'medium', 'exact');
      }
    }
  }
  for (const iso of FOMC_STATEMENT_DATES) {
    const [y, m, d] = iso.split('-').map(Number);
    push(easternToUtc(y, m - 1, d, 14, 0), 'FOMC Statement', 'high', 'exact');
  }

  events.sort((a, b) => a.time - b.time);
  return events;
}

/**
 * A fast "is this instant inside a news window" oracle.
 *
 * @param events    output of buildCalendar
 * @param beforeMin minutes before the release the window opens
 * @param afterMin  minutes after the release the window closes
 * @param filter    which events count (defaults to exact + high importance)
 */
export function makeNewsWindow(events, { beforeMin, afterMin, filter = (e) => e.precision === 'exact' && e.importance === 'high' } = {}) {
  const windows = events
    .filter(filter)
    .map((e) => [e.time - beforeMin * MINUTE, e.time + afterMin * MINUTE, e.name])
    .sort((a, b) => a[0] - b[0]);
  return {
    count: windows.length,
    /** True when `t` falls inside any window. Binary search, no scanning. */
    contains(t) {
      let lo = 0, hi = windows.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (windows[mid][0] > t) hi = mid - 1;
        else if (windows[mid][1] < t) lo = mid + 1;
        else return true;
      }
      return false;
    },
    /** Minutes until the next release at or after `t`, or Infinity. */
    minutesToNext(t, evts = events) {
      for (const e of evts) if (e.time >= t) return (e.time - t) / MINUTE;
      return Infinity;
    },
  };
}

export { DAY, HOUR, MINUTE };
