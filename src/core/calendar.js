// Month-grid maths for the training calendar. Pure and timezone-free: every
// date is handled as a 'YYYY-MM-DD' string so a late-evening workout never
// lands on the wrong day.

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const iso = (y, m, d) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export const parseIso = (s) => {
  const [y, m, d] = String(s).split('-').map(Number);
  return { y, m: m - 1, d };
};

export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

/** Steps a year/month pair by `delta` months, rolling the year over. */
export function shiftMonth(y, m, delta) {
  const total = y * 12 + m + delta;
  return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
}

/**
 * A month laid out as calendar weeks.
 * Leading and trailing cells are null so each row is exactly seven wide.
 * @returns {(string|null)[][]}
 */
export function monthGrid(y, m) {
  const lead = new Date(y, m, 1).getDay();
  const total = daysInMonth(y, m);
  const cells = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => iso(y, m, i + 1))];
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * Index of sessions by date. A date can hold more than one session, so the
 * value is a list — two-a-days should not silently disappear.
 * @returns {Record<string, object[]>}
 */
export function sessionsByDate(sessions) {
  const out = {};
  for (const s of sessions || []) {
    if (!s?.date) continue;
    (out[s.date] ||= []).push(s);
  }
  return out;
}

/** How each day of a month should be drawn. */
export function monthDays(sessions, y, m, todayIso) {
  const byDate = sessionsByDate(sessions);
  return monthGrid(y, m).map((week) =>
    week.map((date) => {
      if (!date) return null;
      const trained = byDate[date] || [];
      return {
        date,
        day: parseIso(date).d,
        trained: trained.length > 0,
        sessions: trained,
        dayId: trained[0]?.dayId || null,
        label: trained.map((s) => s.dayName || s.dayId).join(' + '),
        isToday: date === todayIso,
        isFuture: date > todayIso,
      };
    })
  );
}

/** Counts for the month being viewed. */
export function monthSummary(sessions, y, m, todayIso) {
  const byDate = sessionsByDate(sessions);
  const total = daysInMonth(y, m);
  let trainedDays = 0;
  let sessionCount = 0;
  let restDays = 0;
  for (let d = 1; d <= total; d++) {
    const date = iso(y, m, d);
    const hits = byDate[date];
    if (hits?.length) {
      trainedDays += 1;
      sessionCount += hits.length;
    } else if (date <= todayIso) {
      restDays += 1;
    }
  }
  return { trainedDays, sessionCount, restDays, daysInMonth: total };
}

/**
 * Sessions in the last `days` days, counting today.
 *
 * This replaced a consecutive-weeks streak, which read "0 weeks" for anyone
 * training three times a week and gave no signal on the day you looked at it.
 * A rolling count against your target frequency is useful every day.
 */
export function sessionsInLastDays(sessions, todayIso, days = 7) {
  const byDate = sessionsByDate(sessions);
  const { y, m, d } = parseIso(todayIso);
  let count = 0;
  for (let i = 0; i < days; i++) {
    const date = new Date(Date.UTC(y, m, d - i)).toISOString().slice(0, 10);
    count += (byDate[date] || []).length;
  }
  return count;
}

/** Whole days since the last session, or null if nothing has been logged. */
export function daysSinceLastSession(sessions, todayIso) {
  const dates = (sessions || []).map((s) => s.date).filter(Boolean).sort();
  const last = dates[dates.length - 1];
  if (!last) return null;
  const a = parseIso(last);
  const b = parseIso(todayIso);
  return Math.round((Date.UTC(b.y, b.m, b.d) - Date.UTC(a.y, a.m, a.d)) / 86400000);
}
