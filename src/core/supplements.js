// Daily fuel: protein intake and creatine adherence.
//
// Protein is many entries a day summed against a target; creatine is one dose
// a day where consistency is the whole point, so it is measured as a streak and
// as adherence over a window rather than as a total.

export const CREATINE_DEFAULT_G = 5;

/** Quick-add amounts, in grams of protein. */
export const PROTEIN_PRESETS = [
  { label: 'Whey scoop', grams: 25 },
  { label: 'Chicken 6oz', grams: 50 },
  { label: 'Steak 6oz', grams: 45 },
  { label: 'Greek yogurt', grams: 20 },
  { label: '3 eggs', grams: 18 },
  { label: 'Shake + milk', grams: 33 },
];

const onDate = (rows, date) => (rows || []).filter((r) => r?.date === date);

/** Total grams of protein logged on a date. */
export function proteinOnDate(entries, date) {
  return onDate(entries, date).reduce((sum, e) => sum + (Number(e.grams) || 0), 0);
}

/** One total per day, oldest first — the shape the charts want. */
export function proteinDailyTotals(entries) {
  const byDate = {};
  for (const e of entries || []) {
    if (!e?.date) continue;
    byDate[e.date] = (byDate[e.date] || 0) + (Number(e.grams) || 0);
  }
  return Object.entries(byDate)
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Every ISO date in the `days`-long window ending on `todayIso`, oldest first. */
export function windowDates(todayIso, days) {
  const [y, m, d] = todayIso.split('-').map(Number);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(y, m - 1, d - i));
    out.push(dt.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Protein performance over a window.
 * Only days at or before today count, so a fresh window does not read as
 * missed days you have not lived through yet.
 */
export function proteinAdherence(entries, target, todayIso, days = 7) {
  const dates = windowDates(todayIso, days);
  const totals = dates.map((date) => proteinOnDate(entries, date));
  const logged = totals.filter((t) => t > 0);
  const daysHit = target > 0 ? totals.filter((t) => t >= target).length : 0;
  const average = logged.length ? Math.round(totals.reduce((a, b) => a + b, 0) / dates.length) : 0;
  return { dates, totals, average, daysHit, days: dates.length, loggedDays: logged.length };
}

/** Grams of creatine recorded for a date, 0 if none. */
export function creatineOnDate(log, date) {
  const hit = onDate(log, date)[0];
  return hit ? Number(hit.grams) || 0 : 0;
}

/**
 * Consecutive days ending today on which creatine was taken.
 * Today not being logged yet does not break the streak — it just has not
 * happened. Yesterday missing does.
 */
export function creatineStreak(log, todayIso) {
  const taken = new Set((log || []).filter((r) => Number(r?.grams) > 0).map((r) => r.date));
  const [y, m, d] = todayIso.split('-').map(Number);
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    const date = new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10);
    if (taken.has(date)) streak += 1;
    else if (i === 0) continue; // today is still open
    else break;
  }
  return streak;
}

/** How many of the last `days` days carried a dose. */
export function creatineAdherence(log, todayIso, days = 30) {
  const dates = windowDates(todayIso, days);
  const taken = dates.filter((date) => creatineOnDate(log, date) > 0).length;
  return { taken, of: dates.length, pct: Math.round((taken / dates.length) * 100) };
}

/** Plain-language read on the last week of protein. */
export function proteinVerdict({ average, target, loggedDays, days }) {
  if (!loggedDays) return { status: 'none', message: 'Nothing logged yet this week.' };
  if (!target) return { status: 'none', message: `Averaging ${average} g/day.` };
  const pct = Math.round((average / target) * 100);
  if (pct >= 95) return { status: 'ok', message: `Averaging ${average} g/day — on target.` };
  if (pct >= 80) {
    return { status: 'warn', message: `Averaging ${average} g/day — ${target - average} g short of ${target}.` };
  }
  return {
    status: 'low',
    message: `Averaging ${average} g/day against ${target}. That gap is enough to cost you muscle on a bulk.`,
  };
}
