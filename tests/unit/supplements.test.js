import test from 'node:test';
import assert from 'node:assert/strict';
import {
  proteinOnDate,
  proteinDailyTotals,
  proteinAdherence,
  proteinVerdict,
  creatineOnDate,
  creatineStreak,
  creatineAdherence,
  windowDates,
  CREATINE_DEFAULT_G,
  PROTEIN_PRESETS,
} from '../../src/core/supplements.js';
import { Store, memoryBackend } from '../../src/core/store.js';
import { mergeStates } from '../../src/core/sync.js';

const p = (date, grams, label = '') => ({ id: date + grams + label, date, grams, label });

test('protein for a day sums every entry on it', () => {
  const entries = [p('2026-09-09', 25, 'whey'), p('2026-09-09', 50, 'chicken'), p('2026-09-08', 30)];
  assert.equal(proteinOnDate(entries, '2026-09-09'), 75);
  assert.equal(proteinOnDate(entries, '2026-09-08'), 30);
  assert.equal(proteinOnDate(entries, '2026-09-07'), 0);
});

test('protein totals ignore junk rather than producing NaN', () => {
  const entries = [p('2026-09-09', 25), { date: '2026-09-09', grams: 'abc' }, { grams: 10 }, null];
  assert.equal(proteinOnDate(entries, '2026-09-09'), 25);
  assert.equal(proteinOnDate(null, '2026-09-09'), 0);
});

test('daily totals come back one per day, oldest first', () => {
  const totals = proteinDailyTotals([p('2026-09-09', 25), p('2026-09-08', 30), p('2026-09-09', 50)]);
  assert.deepEqual(totals, [
    { date: '2026-09-08', value: 30 },
    { date: '2026-09-09', value: 75 },
  ]);
});

test('a window ends on today and runs the right length', () => {
  const dates = windowDates('2026-09-09', 7);
  assert.equal(dates.length, 7);
  assert.equal(dates[6], '2026-09-09');
  assert.equal(dates[0], '2026-09-03');
});

test('a window crosses a month boundary correctly', () => {
  const dates = windowDates('2026-09-02', 4);
  assert.deepEqual(dates, ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']);
});

test('adherence averages across the window, not just logged days', () => {
  // 165 on two of seven days: the average is over all seven.
  const entries = [p('2026-09-08', 165), p('2026-09-09', 165)];
  const a = proteinAdherence(entries, 165, '2026-09-09', 7);
  assert.equal(a.days, 7);
  assert.equal(a.loggedDays, 2);
  assert.equal(a.daysHit, 2);
  assert.equal(a.average, Math.round(330 / 7));
});

test('adherence counts a day as hit only at or above target', () => {
  const entries = [p('2026-09-09', 164), p('2026-09-08', 165), p('2026-09-07', 200)];
  assert.equal(proteinAdherence(entries, 165, '2026-09-09', 7).daysHit, 2);
});

test('an empty week reports zeroes, not NaN', () => {
  const a = proteinAdherence([], 165, '2026-09-09', 7);
  assert.equal(a.average, 0);
  assert.equal(a.daysHit, 0);
  assert.equal(a.loggedDays, 0);
});

test('the verdict is honest about a shortfall', () => {
  assert.equal(proteinVerdict({ average: 165, target: 165, loggedDays: 7, days: 7 }).status, 'ok');
  assert.equal(proteinVerdict({ average: 140, target: 165, loggedDays: 7, days: 7 }).status, 'warn');
  const low = proteinVerdict({ average: 100, target: 165, loggedDays: 7, days: 7 });
  assert.equal(low.status, 'low');
  assert.match(low.message, /cost you muscle/);
  assert.equal(proteinVerdict({ average: 0, target: 165, loggedDays: 0, days: 7 }).status, 'none');
});

test('creatine reads back the dose for a day', () => {
  const log = [{ date: '2026-09-09', grams: 5 }];
  assert.equal(creatineOnDate(log, '2026-09-09'), 5);
  assert.equal(creatineOnDate(log, '2026-09-08'), 0);
  assert.equal(creatineOnDate([], '2026-09-09'), 0);
});

test('the creatine streak counts back from today', () => {
  const log = ['2026-09-09', '2026-09-08', '2026-09-07'].map((date) => ({ date, grams: 5 }));
  assert.equal(creatineStreak(log, '2026-09-09'), 3);
});

test('today not being logged yet does not break the streak', () => {
  const log = ['2026-09-08', '2026-09-07'].map((date) => ({ date, grams: 5 }));
  assert.equal(creatineStreak(log, '2026-09-09'), 2);
});

test('a missed day ends the streak', () => {
  const log = ['2026-09-09', '2026-09-07', '2026-09-06'].map((date) => ({ date, grams: 5 }));
  assert.equal(creatineStreak(log, '2026-09-09'), 1);
});

test('a zero dose does not count as taken', () => {
  assert.equal(creatineStreak([{ date: '2026-09-09', grams: 0 }], '2026-09-09'), 0);
});

test('creatine adherence reports days taken out of the window', () => {
  const log = ['2026-09-09', '2026-09-08', '2026-09-01'].map((date) => ({ date, grams: 5 }));
  const a = creatineAdherence(log, '2026-09-09', 30);
  assert.equal(a.taken, 3);
  assert.equal(a.of, 30);
  assert.equal(a.pct, 10);
  assert.equal(creatineAdherence([], '2026-09-09', 30).pct, 0);
});

test('the presets are sane grams of protein', () => {
  assert.ok(PROTEIN_PRESETS.length >= 4);
  for (const preset of PROTEIN_PRESETS) {
    assert.ok(preset.grams > 0 && preset.grams < 100, preset.label);
    assert.ok(preset.label.length);
  }
  assert.equal(CREATINE_DEFAULT_G, 5);
});

// ------------------------------------------------------------------- storage

const newStore = () => new Store(memoryBackend());

test('protein entries accumulate through the day', () => {
  const s = newStore();
  s.addProtein(25, 'whey', '2026-09-09');
  s.addProtein(50, 'chicken', '2026-09-09');
  assert.equal(s.state.protein.length, 2);
  assert.equal(proteinOnDate(s.state.protein, '2026-09-09'), 75);
});

test('a protein entry can be removed', () => {
  const s = newStore();
  s.addProtein(25, 'whey', '2026-09-09');
  s.removeProtein(s.state.protein[0].id);
  assert.equal(s.state.protein.length, 0);
});

test('non-numeric protein is rejected', () => {
  const s = newStore();
  s.addProtein('abc', 'x', '2026-09-09');
  s.addProtein(0, 'x', '2026-09-09');
  s.addProtein(-20, 'x', '2026-09-09');
  assert.equal(s.state.protein.length, 0);
});

test('creatine keeps one dose per day and replaces on re-log', () => {
  const s = newStore();
  s.setCreatine(5, '2026-09-09');
  s.setCreatine(10, '2026-09-09');
  assert.equal(s.state.creatine.length, 1);
  assert.equal(creatineOnDate(s.state.creatine, '2026-09-09'), 10);
});

test('setting creatine to zero clears the day', () => {
  const s = newStore();
  s.setCreatine(5, '2026-09-09');
  s.setCreatine(0, '2026-09-09');
  assert.equal(s.state.creatine.length, 0);
});

test('fuel survives export and import', () => {
  const s = newStore();
  s.addProtein(25, 'whey', '2026-09-09');
  s.setCreatine(5, '2026-09-09');
  const fresh = newStore();
  fresh.importJSON(s.exportJSON());
  assert.equal(fresh.state.protein.length, 1);
  assert.equal(fresh.state.creatine.length, 1);
});

test('an older backup with no fuel fields still loads', () => {
  const s = newStore();
  s.importJSON(JSON.stringify({ version: 1, sessions: [], settings: {} }));
  assert.deepEqual(s.state.protein, []);
  assert.deepEqual(s.state.creatine, []);
});

// ---------------------------------------------------------------------- sync

test('protein logged on two devices merges rather than overwriting', () => {
  const base = newStore().state;
  const local = { ...base, updatedAt: 20, protein: [p('2026-09-09', 25, 'whey')] };
  const remote = { ...base, updatedAt: 10, protein: [p('2026-09-09', 50, 'chicken')] };
  const merged = mergeStates(local, remote);
  assert.equal(merged.protein.length, 2);
  assert.equal(proteinOnDate(merged.protein, '2026-09-09'), 75);
});

test('creatine merges by date, newer snapshot winning the day', () => {
  const base = newStore().state;
  const local = { ...base, updatedAt: 99, creatine: [{ id: 'a', date: '2026-09-09', grams: 10 }] };
  const remote = { ...base, updatedAt: 1, creatine: [{ id: 'b', date: '2026-09-09', grams: 5 }] };
  const merged = mergeStates(local, remote);
  assert.equal(merged.creatine.length, 1);
  assert.equal(merged.creatine[0].grams, 10);
});

test('a stale snapshot cannot wipe fuel the other side logged', () => {
  const base = newStore().state;
  const local = { ...base, updatedAt: 100, protein: [p('2026-09-09', 25)], creatine: [{ id: 'c', date: '2026-09-09', grams: 5 }] };
  const remote = { ...base, updatedAt: 1, protein: [], creatine: [] };
  assert.equal(mergeStates(local, remote).protein.length, 1);
  assert.equal(mergeStates(remote, local).creatine.length, 1);
});
