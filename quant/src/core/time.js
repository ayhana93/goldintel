// UTC-first time utilities. Everything inside the research stack is UTC milliseconds.
// Nothing here reads the host timezone.

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const TF_MINUTES = { M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440, W1: 10080 };

export function tfMillis(tf) {
  const m = TF_MINUTES[tf];
  if (!m) throw new Error(`Unknown timeframe: ${tf}`);
  return m * MINUTE;
}

/** Last Sunday of a month, as a UTC Date at 00:00. */
function lastSundayUTC(year, monthIndex) {
  const d = new Date(Date.UTC(year, monthIndex + 1, 0)); // last day of month
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

/**
 * EU summer time: from the last Sunday of March 01:00 UTC to the last Sunday of
 * October 01:00 UTC. Used to convert MT4-style EET/EEST broker stamps to UTC.
 */
export function isEuSummerTime(utcMs) {
  const y = new Date(utcMs).getUTCFullYear();
  const start = lastSundayUTC(y, 2).getTime() + HOUR;
  const end = lastSundayUTC(y, 9).getTime() + HOUR;
  return utcMs >= start && utcMs < end;
}

/**
 * Convert an "YYYY-MM-DD HH:MM:SS" stamp expressed in EET/EEST (UTC+2 winter,
 * UTC+3 summer) to UTC milliseconds.
 *
 * The offset depends on the instant, and the instant depends on the offset, so
 * we resolve by trying the winter offset first and re-checking. Both candidate
 * instants agree except inside the one-hour transition windows; there we prefer
 * the summer reading, matching how MT4 servers stamp the changeover.
 */
export function eetStampToUtcMs(stamp) {
  const naive = Date.parse(`${stamp.replace(' ', 'T')}Z`);
  if (Number.isNaN(naive)) throw new Error(`Unparseable timestamp: ${stamp}`);
  const summerGuess = naive - 3 * HOUR;
  if (isEuSummerTime(summerGuess)) return summerGuess;
  return naive - 2 * HOUR;
}

/** Floor a UTC instant to the open of its timeframe bucket. */
export function floorToTf(utcMs, tf) {
  const step = tfMillis(tf);
  return Math.floor(utcMs / step) * step;
}

export function toIso(utcMs) {
  return new Date(utcMs).toISOString();
}

export function utcHour(utcMs) {
  return new Date(utcMs).getUTCHours();
}

/** 0 = Sunday .. 6 = Saturday, in UTC. */
export function utcDayOfWeek(utcMs) {
  return new Date(utcMs).getUTCDay();
}

export function utcDateKey(utcMs) {
  return new Date(utcMs).toISOString().slice(0, 10);
}

export function utcMonthKey(utcMs) {
  return new Date(utcMs).toISOString().slice(0, 7);
}

/** ISO week key, e.g. "2019-W07". Used by the weekly risk kill switch. */
export function utcWeekKey(utcMs) {
  const d = new Date(utcMs);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const thursday = new Date(d.getTime() + (3 - day) * DAY);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / (7 * DAY)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Trading sessions in UTC. Gold trades nearly 24h, so these are liquidity
 * windows rather than exchange hours. Deliberately few and non-overlapping in
 * the primary label; OVERLAP is reported separately.
 *
 *   ASIA    23:00 - 07:00
 *   LONDON  07:00 - 12:00
 *   OVERLAP 12:00 - 16:00   (London afternoon + New York morning)
 *   NEWYORK 16:00 - 21:00
 *   LATE    21:00 - 23:00
 */
export function sessionOf(utcMs) {
  const h = utcHour(utcMs);
  if (h >= 23 || h < 7) return 'ASIA';
  if (h < 12) return 'LONDON';
  if (h < 16) return 'OVERLAP';
  if (h < 21) return 'NEWYORK';
  return 'LATE';
}

/** First hour of the London and New York sessions, for the Phase 14 study. */
export function sessionOpenHour(utcMs) {
  const h = utcHour(utcMs);
  if (h === 7) return 'LONDON_OPEN_H1';
  if (h === 12) return 'NY_OPEN_H1';
  return null;
}
