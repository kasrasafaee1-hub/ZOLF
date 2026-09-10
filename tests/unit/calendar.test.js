import test from 'node:test';
import assert from 'node:assert/strict';
import {
  monthGrid,
  monthDays,
  monthSummary,
  sessionsByDate,
  sessionsInLastDays,
  daysSinceLastSession,
  shiftMonth,
  daysInMonth,
  iso,
  parseIso,
} from '../../src/core/calendar.js';

const s = (date, dayId = 'legs', dayName = 'Legs') => ({ id: date + dayId, date, dayId, dayName });

test('iso formatting pads month and day', () => {
  assert.equal(iso(2026, 0, 1), '2026-01-01');
  assert.equal(iso(2026, 8, 9), '2026-09-09');
  assert.equal(iso(2026, 11, 31), '2026-12-31');
});

test('parseIso round-trips', () => {
  assert.deepEqual(parseIso('2026-09-09'), { y: 2026, m: 8, d: 9 });
});

test('daysInMonth handles leap years', () => {
  assert.equal(daysInMonth(2026, 1), 28);
  assert.equal(daysInMonth(2028, 1), 29);
  assert.equal(daysInMonth(2026, 8), 30);
  assert.equal(daysInMonth(2026, 0), 31);
});

test('shiftMonth rolls over year boundaries in both directions', () => {
  assert.deepEqual(shiftMonth(2026, 11, 1), { y: 2027, m: 0 });
  assert.deepEqual(shiftMonth(2026, 0, -1), { y: 2025, m: 11 });
  assert.deepEqual(shiftMonth(2026, 8, 0), { y: 2026, m: 8 });
  assert.deepEqual(shiftMonth(2026, 0, -13), { y: 2024, m: 11 });
});

test('every week in a grid is exactly seven cells', () => {
  for (let m = 0; m < 12; m++) {
    for (const week of monthGrid(2026, m)) assert.equal(week.length, 7, `month ${m}`);
  }
});

test('a grid contains every day of the month exactly once', () => {
  const flat = monthGrid(2026, 8).flat().filter(Boolean);
  assert.equal(flat.length, 30);
  assert.equal(flat[0], '2026-09-01');
  assert.equal(flat[29], '2026-09-30');
  assert.equal(new Set(flat).size, 30);
});

test('the first day of the month sits under the right weekday', () => {
  // 2026-09-01 is a Tuesday, so it is the third cell of the first row.
  const grid = monthGrid(2026, 8);
  assert.equal(grid[0][0], null);
  assert.equal(grid[0][1], null);
  assert.equal(grid[0][2], '2026-09-01');
});

test('a month starting on Sunday has no leading blanks', () => {
  // 2026-02-01 is a Sunday.
  assert.equal(monthGrid(2026, 1)[0][0], '2026-02-01');
});

test('sessions index by date and keep two-a-days', () => {
  const idx = sessionsByDate([s('2026-09-01'), s('2026-09-01', 'full', 'Arms'), s('2026-09-03')]);
  assert.equal(idx['2026-09-01'].length, 2);
  assert.equal(idx['2026-09-03'].length, 1);
  assert.equal(idx['2026-09-02'], undefined);
});

test('sessions with no date are ignored rather than crashing', () => {
  assert.deepEqual(sessionsByDate([{ id: 'x' }, null]), {});
  assert.deepEqual(sessionsByDate(null), {});
});

test('trained days are marked and rest days are not', () => {
  const days = monthDays([s('2026-09-01'), s('2026-09-03')], 2026, 8, '2026-09-09').flat().filter(Boolean);
  const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
  assert.equal(byDate['2026-09-01'].trained, true);
  assert.equal(byDate['2026-09-01'].dayId, 'legs');
  assert.equal(byDate['2026-09-02'].trained, false);
  assert.equal(byDate['2026-09-03'].trained, true);
});

test('today and future days are flagged', () => {
  const days = monthDays([], 2026, 8, '2026-09-09').flat().filter(Boolean);
  const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
  assert.equal(byDate['2026-09-09'].isToday, true);
  assert.equal(byDate['2026-09-09'].isFuture, false);
  assert.equal(byDate['2026-09-10'].isFuture, true);
  assert.equal(byDate['2026-09-08'].isFuture, false);
});

test('a two-a-day is labelled with both sessions', () => {
  const days = monthDays(
    [s('2026-09-01'), s('2026-09-01', 'full', 'Full body')],
    2026, 8, '2026-09-09'
  ).flat().filter(Boolean);
  const day = days.find((d) => d.date === '2026-09-01');
  assert.equal(day.sessions.length, 2);
  assert.match(day.label, /Legs.*\+.*Full body/);
});

test('the month summary counts trained days, sessions and rest days so far', () => {
  const sessions = [s('2026-09-01'), s('2026-09-01', 'full'), s('2026-09-03')];
  const sum = monthSummary(sessions, 2026, 8, '2026-09-09');
  assert.equal(sum.trainedDays, 2);
  assert.equal(sum.sessionCount, 3, 'both halves of the two-a-day count');
  assert.equal(sum.restDays, 7, 'Sep 2,4,5,6,7,8,9 — days elapsed that were not trained');
  assert.equal(sum.daysInMonth, 30);
});

test('future days are not counted as rest days', () => {
  const sum = monthSummary([], 2026, 8, '2026-09-02');
  assert.equal(sum.restDays, 2);
  assert.equal(sum.trainedDays, 0);
});






test('days since the last session', () => {
  assert.equal(daysSinceLastSession([s('2026-09-07')], '2026-09-09'), 2);
  assert.equal(daysSinceLastSession([s('2026-09-09')], '2026-09-09'), 0);
  assert.equal(daysSinceLastSession([], '2026-09-09'), null);
});

test('days since the last session spans a month boundary', () => {
  assert.equal(daysSinceLastSession([s('2026-08-31')], '2026-09-02'), 2);
});

test('days since uses the latest session, not the last in the array', () => {
  assert.equal(daysSinceLastSession([s('2026-09-08'), s('2026-09-01')], '2026-09-09'), 1);
});

test('the rolling count covers the last seven days including today', () => {
  const sessions = ['2026-09-09', '2026-09-08', '2026-09-04', '2026-09-01'].map((d) => s(d));
  assert.equal(sessionsInLastDays(sessions, '2026-09-09', 7), 3, 'Sep 1 falls outside the window');
  assert.equal(sessionsInLastDays(sessions, '2026-09-09', 14), 4);
  assert.equal(sessionsInLastDays([], '2026-09-09', 7), 0);
});

test('two sessions in one day both count toward the week', () => {
  const sessions = [s('2026-09-09'), s('2026-09-09', 'push', 'Push')];
  assert.equal(sessionsInLastDays(sessions, '2026-09-09', 7), 2);
});

test('the window crosses a month boundary', () => {
  assert.equal(sessionsInLastDays([s('2026-08-31')], '2026-09-02', 7), 1);
  assert.equal(sessionsInLastDays([s('2026-08-25')], '2026-09-02', 7), 0);
});
