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
 * Consecutive calendar weeks, counting back from the week containing
 * `todayIso`, that hit `target` sessions or more. The current week counts only
 * once it has already reached the target, so a week still in progress never
 * breaks a run you are on track to keep.
 */
export function weeklyStreak(sessions, todayIso, target = 4) {
  const byDate = sessionsByDate(sessions);
  const { y, m, d } = parseIso(todayIso);
  const today = new Date(y, m, d);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());

  let streak = 0;
  for (let back = 0; back < 260; back++) {
    const start = new Date(weekStart);
    start.setDate(weekStart.getDate() - back * 7);
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const key = iso(day.getFullYear(), day.getMonth(), day.getDate());
      if (key > todayIso) continue;
      count += (byDate[key] || []).length;
    }
    if (count >= target) streak += 1;
    else if (back > 0) break;
    else if (count < target) continue; // an unfinished current week is not a break
  }
  return streak;
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
