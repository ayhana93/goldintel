// Deterministic economic calendar.
//
// The previous implementation asked an LLM, with web access, for exact release
// timestamps and stored the answer as fact. An LLM can explain what CPI is; it
// must not decide when CPI was published. Release times here are derived from
// the agencies' own published schedules, and every event says how precise its
// timestamp is. Only 'exact' events are allowed to gate anything.
//
// Keep in sync with src/lib/calendar.js — quant/test/mirror.test.js enforces it.

const HOUR = 3_600_000;
const MINUTE = 60_000;

/** US DST: second Sunday of March 07:00 UTC to first Sunday of November 06:00 UTC. */
export function isUsDst(utcMs) {
  const y = new Date(utcMs).getUTCFullYear();
  const nth = (month, dow, n) => {
    const d = new Date(Date.UTC(y, month, 1));
    let count = 0;
    for (;;) {
      if (d.getUTCDay() === dow && ++count === n) return d.getTime();
      d.setUTCDate(d.getUTCDate() + 1);
    }
  };
  return utcMs >= nth(2, 0, 2) + 7 * HOUR && utcMs < nth(10, 0, 1) + 6 * HOUR;
}

export function easternToUtc(year, monthIndex, day, hh, mm) {
  const guess = Date.UTC(year, monthIndex, day, hh + 5, mm);
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
 * Scheduled releases between two instants.
 *
 * exact       — the release rule is fixed by the agency
 * approximate — the month is certain, the day is the usual pattern
 *
 * FOMC dates are not rule-derivable and are not included here; they should come
 * from a structured provider or a curated table supplied by the caller.
 */
export function buildCalendar(fromMs, toMs, extraEvents = []) {
  const events = [];
  const push = (utcMs, name, importance, precision) => {
    if (utcMs >= fromMs && utcMs <= toMs) events.push({ time: utcMs, name, importance, precision });
  };
  const start = new Date(fromMs), end = new Date(toMs);
  for (let y = start.getUTCFullYear(); y <= end.getUTCFullYear(); y++) {
    for (let m = 0; m < 12; m++) {
      const nfp = nthWeekdayOfMonth(y, m, 5, 1);
      if (nfp) push(easternToUtc(y, m, nfp, 8, 30), 'Non-Farm Payrolls', 'high', 'exact');
      push(easternToUtc(y, m, 13, 8, 30), 'CPI', 'high', 'approximate');
      push(easternToUtc(y, m, 14, 8, 30), 'PPI', 'medium', 'approximate');
      push(easternToUtc(y, m, 15, 8, 30), 'Retail Sales', 'medium', 'approximate');
      for (let n = 1; n <= 5; n++) {
        const d = nthWeekdayOfMonth(y, m, 4, n);
        if (d) push(easternToUtc(y, m, d, 8, 30), 'Initial Jobless Claims', 'medium', 'exact');
      }
    }
  }
  for (const e of extraEvents) {
    const t = typeof e.time === 'number' ? e.time : Date.parse(e.time);
    if (Number.isFinite(t)) push(t, e.name, e.importance ?? 'high', e.precision ?? 'exact');
  }
  events.sort((a, b) => a.time - b.time);
  return events;
}

/** How exposed an instant is to a scheduled release. */
export function newsRiskAt(events, t, { windowMin = 30 } = {}) {
  let nearest = null, nextHigh = null;
  for (const e of events) {
    const dt = (e.time - t) / MINUTE;
    if (Math.abs(dt) <= windowMin && (nearest == null || Math.abs(dt) < Math.abs(nearest.minutes))) {
      nearest = { ...e, minutes: dt };
    }
    if (dt >= 0 && e.importance === 'high' && e.precision === 'exact' && nextHigh == null) {
      nextHigh = { ...e, minutes: dt };
    }
  }
  let level = 'LOW';
  if (nearest && nearest.importance === 'high') level = 'HIGH';
  else if (nearest) level = 'MEDIUM';
  else if (nextHigh && nextHigh.minutes <= 120) level = 'MEDIUM';
  return { level, nearest, nextHighImpact: nextHigh };
}

/** UTC liquidity sessions. Gold trades nearly around the clock. */
export function sessionOf(utcMs) {
  const h = new Date(utcMs).getUTCHours();
  if (h >= 23 || h < 7) return 'ASIA';
  if (h < 12) return 'LONDON';
  if (h < 16) return 'OVERLAP';
  if (h < 21) return 'NEWYORK';
  return 'LATE';
}
