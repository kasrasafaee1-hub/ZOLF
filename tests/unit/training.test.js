import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimated1RM,
  sessionVolume,
  sessionHardSets,
  bestSet,
  suggestNext,
  exercisePR,
  isNewPR,
  e1rmSeries,
  volumeByMuscle,
  volumeAudit,
  buildExerciseIndex,
} from '../../src/core/training.js';
import { PROGRAMS, plannedWeeklyVolume, getDay } from '../../src/core/programs.js';

const set = (weight, reps, done = true) => ({ weight, reps, rpe: '', done });

test('Epley 1RM matches the textbook value', () => {
  assert.equal(estimated1RM(225, 5), 262.5);
  assert.equal(estimated1RM(100, 1), 103.3);
});

test('1RM rejects garbage input instead of returning NaN', () => {
  assert.equal(estimated1RM(0, 5), 0);
  assert.equal(estimated1RM(225, 0), 0);
  assert.equal(estimated1RM(NaN, 5), 0);
  assert.equal(estimated1RM(-10, 5), 0);
  assert.equal(estimated1RM(225, undefined), 0);
});

test('1RM caps reps at 12 so high-rep sets do not invent records', () => {
  assert.equal(estimated1RM(100, 20), estimated1RM(100, 12));
});

test('volume counts only completed sets', () => {
  const s = {
    entries: [
      { exerciseId: 'a', sets: [set(100, 10), set(100, 10), { weight: 100, reps: 10, done: false }] },
      { exerciseId: 'b', sets: [set(50, 12)] },
    ],
  };
  assert.equal(sessionVolume(s), 2600);
  assert.equal(sessionHardSets(s), 3);
});

test('volume tolerates empty and malformed sessions', () => {
  assert.equal(sessionVolume(null), 0);
  assert.equal(sessionVolume({}), 0);
  assert.equal(sessionHardSets({ entries: [{ sets: [] }] }), 0);
});

test('bodyweight sets with no load still count as hard sets', () => {
  const s = { entries: [{ exerciseId: 'pullup', sets: [set(0, 10), set(0, 8)] }] };
  assert.equal(sessionHardSets(s), 2);
  assert.equal(sessionVolume(s), 0);
});

test('bestSet ranks by estimated 1RM, not by weight alone', () => {
  const b = bestSet({ sets: [set(200, 5), set(185, 10)] });
  assert.equal(b.weight, 185); // 185x10 = 246.7 beats 200x5 = 233.3
});

test('bestSet returns null when nothing was completed', () => {
  assert.equal(bestSet({ sets: [{ weight: 100, reps: 10, done: false }] }), null);
  assert.equal(bestSet(null), null);
});

const squat = { id: 'back-squat', repRange: [5, 8], type: 'compound', muscle: 'quads' };
const curl = { id: 'curl', repRange: [10, 12], type: 'isolation', muscle: 'biceps' };

test('progression adds weight only when every top set hits the ceiling', () => {
  const s = suggestNext({ sets: [set(185, 8), set(185, 8), set(185, 8)] }, squat);
  assert.equal(s.weight, 195); // lower-body compound -> +10
  assert.equal(s.reps, 5);
});

test('progression holds weight when one set falls short of the ceiling', () => {
  const s = suggestNext({ sets: [set(185, 8), set(185, 7), set(185, 8)] }, squat);
  assert.equal(s.weight, 185);
  assert.equal(s.reps, 8);
});

test('isolation lifts step up 5 lb, not 10', () => {
  const s = suggestNext({ sets: [set(30, 12), set(30, 12)] }, curl);
  assert.equal(s.weight, 35);
});

test('progression backs the weight off after a failed set', () => {
  const s = suggestNext({ sets: [set(225, 4), set(225, 5)] }, squat);
  assert.equal(s.weight, 215);
  assert.match(s.reason, /drop/i);
});

test('progression never suggests a negative weight', () => {
  const s = suggestNext({ sets: [set(0, 2)] }, squat);
  assert.ok(s.weight >= 0);
});

test('progression gives a starting point on a brand new lift', () => {
  const s = suggestNext(null, squat);
  assert.equal(s.weight, null);
  assert.equal(s.reps, 5);
});

test('progression ignores incomplete sets when reading last session', () => {
  const s = suggestNext({ sets: [set(185, 8), { weight: 185, reps: 3, done: false }] }, squat);
  assert.equal(s.weight, 195);
});

test('progression judges only the heaviest weight used, not back-off sets', () => {
  const s = suggestNext({ sets: [set(185, 8), set(185, 8), set(135, 12)] }, squat);
  assert.equal(s.weight, 195);
});

const sessions = [
  { id: 's1', date: '2026-09-01', entries: [{ exerciseId: 'back-squat', sets: [set(185, 5)] }] },
  { id: 's2', date: '2026-09-08', entries: [{ exerciseId: 'back-squat', sets: [set(205, 5)] }] },
  { id: 's3', date: '2026-09-15', entries: [{ exerciseId: 'back-squat', sets: [set(195, 5)] }] },
];

test('PR is the best estimated 1RM across all history', () => {
  const pr = exercisePR(sessions, 'back-squat');
  assert.equal(pr.weight, 205);
  assert.equal(pr.date, '2026-09-08');
});

test('PR is null for a lift never performed', () => {
  assert.equal(exercisePR(sessions, 'bench-press'), null);
});

test('a new PR is detected only against sessions that came before it', () => {
  assert.equal(isNewPR(sessions, sessions[1], 'back-squat'), true);
  assert.equal(isNewPR(sessions, sessions[2], 'back-squat'), false);
  assert.equal(isNewPR(sessions, sessions[0], 'back-squat'), true); // first ever
});

test('e1rm series is chronological', () => {
  const series = e1rmSeries(sessions, 'back-squat');
  assert.equal(series.length, 3);
  assert.deepEqual(
    series.map((p) => p.date),
    ['2026-09-01', '2026-09-08', '2026-09-15']
  );
});

test('weekly volume only counts sessions inside the window', () => {
  const now = new Date('2026-09-16T12:00:00Z');
  const idx = { 'back-squat': { muscle: 'quads' } };
  const v = volumeByMuscle(sessions, idx, 7, now);
  assert.equal(v.quads, 1); // only 2026-09-15 falls in the last 7 days
  const v30 = volumeByMuscle(sessions, idx, 30, now);
  assert.equal(v30.quads, 3);
});

test('volume audit flags under- and over-shooting muscles worst-first', () => {
  const rows = volumeAudit({ quads: 2, biceps: 30, chest: 12 });
  assert.equal(rows[0].status, 'low');
  assert.equal(rows.find((r) => r.muscle === 'biceps').status, 'high');
  assert.equal(rows.find((r) => r.muscle === 'chest').status, 'ok');
});

test('exercise index covers every exercise in a program', () => {
  const idx = buildExerciseIndex(PROGRAMS['kasra-4day']);
  assert.ok(idx['back-squat']);
  assert.ok(idx['ez-bar-curl']);
  for (const day of PROGRAMS['kasra-4day'].days) {
    for (const e of day.exercises) assert.ok(idx[e.id], `${e.id} missing from index`);
  }
});

test('every program day is well formed', () => {
  for (const program of Object.values(PROGRAMS)) {
    assert.equal(program.days.length, 4, `${program.id} should be a 4-day split`);
    for (const day of program.days) {
      assert.ok(day.exercises.length >= 6, `${day.id} is too thin`);
      const ids = day.exercises.map((e) => e.id);
      assert.equal(new Set(ids).size, ids.length, `${day.id} has duplicate exercise ids`);
      for (const e of day.exercises) {
        assert.ok(e.sets > 0);
        assert.ok(e.repRange[0] < e.repRange[1], `${e.id} rep range is inverted`);
      }
    }
  }
});

test('getDay resolves real days and refuses fake ones', () => {
  assert.equal(getDay('kasra-4day', 'legs-core').name, 'Legs, Abs & Core');
  assert.equal(getDay('kasra-4day', 'nope'), null);
});

test("the user's split under-does legs and over-does arms", () => {
  // This is the finding the app surfaces on the Volume screen; lock it in so a
  // future edit to the program cannot silently change the advice.
  const v = plannedWeeklyVolume('kasra-4day');
  assert.ok(v.biceps > v.quads, 'expected the arm bias this split has');
  const audit = volumeAudit(v);
  assert.equal(audit.find((r) => r.muscle === 'glutes').status, 'low');
  assert.equal(audit.find((r) => r.muscle === 'biceps').status, 'high');
});

test('the balanced alternative fixes the leg volume', () => {
  const v = plannedWeeklyVolume('balanced-4day');
  const audit = volumeAudit(v);
  for (const m of ['quads', 'hamstrings', 'glutes', 'biceps', 'triceps']) {
    assert.equal(audit.find((r) => r.muscle === m).status, 'ok', `${m} should be in range`);
  }
});
