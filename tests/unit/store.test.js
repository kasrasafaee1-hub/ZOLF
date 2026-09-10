import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, memoryBackend, defaultState, migrate, today, STORAGE_KEY } from '../../src/core/store.js';
import { getDay, PROGRAMS } from '../../src/core/programs.js';

const legDay = getDay('block-a', 'legs');
const newStore = () => new Store(memoryBackend());

const completeEntry = (store, exerciseId, weight, reps, count = 3) => {
  for (let i = 0; i < count; i++) store.setSet(exerciseId, i, { weight, reps, done: true });
};

test('a fresh store starts on the requested split with no history', () => {
  const s = newStore();
  assert.equal(s.state.settings.programId, 'block-a');
  assert.deepEqual(s.state.sessions, []);
  assert.equal(s.state.active, null);
});

test('starting a session builds one entry per exercise with the planned sets', () => {
  const s = newStore();
  const session = s.startSession(legDay, '2026-09-09');
  assert.equal(session.entries.length, legDay.exercises.length);
  assert.equal(session.entries[0].sets.length, legDay.exercises[0].sets);
  assert.equal(s.state.active.dayId, 'legs');
});

test('logged sets persist through a reload of the same backend', () => {
  const backend = memoryBackend();
  const s1 = new Store(backend);
  s1.startSession(legDay, '2026-09-09');
  s1.setSet('back-squat', 0, { weight: 185, reps: 8, done: true });

  const s2 = new Store(backend);
  const entry = s2.state.active.entries.find((e) => e.exerciseId === 'back-squat');
  assert.equal(entry.sets[0].weight, 185);
  assert.equal(entry.sets[0].done, true);
});

test('finishing a session files it in history and clears the active one', () => {
  const s = newStore();
  s.startSession(legDay, '2026-09-09');
  completeEntry(s, 'back-squat', 185, 8);
  const done = s.finishSession();
  assert.ok(done);
  assert.equal(s.state.active, null);
  assert.equal(s.state.sessions.length, 1);
  assert.ok(done.finishedAt);
});

test('finishing drops sets that were never completed', () => {
  const s = newStore();
  s.startSession(legDay, '2026-09-09');
  s.setSet('back-squat', 0, { weight: 185, reps: 8, done: true });
  s.setSet('back-squat', 1, { weight: 185, reps: 8, done: false });
  const done = s.finishSession();
  const entry = done.entries.find((e) => e.exerciseId === 'back-squat');
  assert.equal(entry.sets.length, 1);
  assert.equal(done.entries.length, 1, 'exercises with no completed sets are dropped');
});

test('an entirely empty session is discarded, not saved as a blank workout', () => {
  const s = newStore();
  s.startSession(legDay, '2026-09-09');
  const done = s.finishSession();
  assert.equal(done, null);
  assert.equal(s.state.sessions.length, 0);
  assert.equal(s.state.active, null);
});

test('finishing with no active session is a no-op, not a crash', () => {
  const s = newStore();
  assert.equal(s.finishSession(), null);
});

test('sets can be added and removed, but never down to zero', () => {
  const s = newStore();
  s.startSession(legDay, '2026-09-09');
  const before = s.state.active.entries[0].sets.length;
  s.addSet('back-squat');
  assert.equal(s.state.active.entries[0].sets.length, before + 1);
  for (let i = 0; i < 20; i++) s.removeSet('back-squat', 0);
  assert.equal(s.state.active.entries[0].sets.length, 1);
});

test('an added set inherits the weight of the one before it', () => {
  const s = newStore();
  s.startSession(legDay, '2026-09-09');
  s.setSet('back-squat', 3, { weight: 185, reps: 8, done: true });
  s.addSet('back-squat');
  const sets = s.state.active.entries[0].sets;
  assert.equal(sets[sets.length - 1].weight, 185);
});

test('setSet grows the array when writing past the end', () => {
  const s = newStore();
  s.startSession(legDay, '2026-09-09');
  s.setSet('back-squat', 8, { weight: 135, reps: 10, done: true });
  assert.equal(s.state.active.entries[0].sets[8].weight, 135);
});

test('writing to an unknown exercise is ignored', () => {
  const s = newStore();
  s.startSession(legDay, '2026-09-09');
  s.setSet('does-not-exist', 0, { weight: 100, reps: 10, done: true });
  assert.ok(s.state.active);
});

test('discarding throws the session away', () => {
  const s = newStore();
  s.startSession(legDay, '2026-09-09');
  completeEntry(s, 'back-squat', 185, 8);
  s.discardSession();
  assert.equal(s.state.active, null);
  assert.equal(s.state.sessions.length, 0);
});

test('lastEntryFor finds the most recent time a lift was trained', () => {
  const s = newStore();
  s.startSession(legDay, '2026-09-01');
  completeEntry(s, 'back-squat', 185, 8);
  s.finishSession();
  s.startSession(legDay, '2026-09-08');
  completeEntry(s, 'back-squat', 195, 8);
  s.finishSession();

  const last = s.lastEntryFor('back-squat');
  assert.equal(last.session.date, '2026-09-08');
  assert.equal(last.entry.sets[0].weight, 195);
  assert.equal(s.lastEntryFor('bench-press'), null);
});

test('sessions stay sorted by date even when logged out of order', () => {
  const s = newStore();
  for (const d of ['2026-09-15', '2026-09-01', '2026-09-08']) {
    s.startSession(legDay, d);
    completeEntry(s, 'back-squat', 185, 8, 1);
    s.finishSession();
  }
  assert.deepEqual(
    s.state.sessions.map((x) => x.date),
    ['2026-09-01', '2026-09-08', '2026-09-15']
  );
});

test('sessions can be deleted by id', () => {
  const s = newStore();
  s.startSession(legDay, '2026-09-09');
  completeEntry(s, 'back-squat', 185, 8, 1);
  const done = s.finishSession();
  s.deleteSession(done.id);
  assert.equal(s.state.sessions.length, 0);
});

test('one bodyweight per day — logging again replaces it', () => {
  const s = newStore();
  s.addBodyweight(179.7, '2026-09-09');
  s.addBodyweight(180.2, '2026-09-09');
  assert.equal(s.state.bodyweights.length, 1);
  assert.equal(s.state.bodyweights[0].weight, 180.2);
});

test('non-numeric bodyweights are rejected', () => {
  const s = newStore();
  s.addBodyweight('abc', '2026-09-09');
  s.addBodyweight(-5, '2026-09-09');
  s.addBodyweight('', '2026-09-09');
  assert.equal(s.state.bodyweights.length, 0);
});

test('InBody metrics are stored and the latest one is retrievable', () => {
  const s = newStore();
  s.addMetric({ date: '2026-09-09', weight: 179.7, bodyFatPct: 16.5, smm: 85.3 });
  s.addMetric({ date: '2026-10-09', weight: 183.0, bodyFatPct: 17.2, smm: 87.0 });
  const latest = s.latestMetric();
  assert.equal(latest.date, '2026-10-09');
  assert.equal(latest.smm, 87.0);
  assert.equal(s.latestMetric.call(newStore()), null);
});

test('metrics can be deleted', () => {
  const s = newStore();
  s.addMetric({ date: '2026-09-09', weight: 179.7, bodyFatPct: 16.5 });
  s.deleteMetric(s.state.metrics[0].id);
  assert.equal(s.state.metrics.length, 0);
});

test('settings changes stick', () => {
  const s = newStore();
  s.setSetting('phaseId', 'cut');
  s.setSetting('programId', 'block-b');
  assert.equal(s.state.settings.phaseId, 'cut');
  assert.equal(s.state.settings.programId, 'block-b');
});

test('export then import restores an identical state', () => {
  const s = newStore();
  s.startSession(legDay, '2026-09-09');
  completeEntry(s, 'back-squat', 185, 8);
  s.finishSession();
  s.addBodyweight(179.7, '2026-09-09');
  const json = s.exportJSON();

  const fresh = newStore();
  fresh.importJSON(json);
  assert.equal(fresh.state.sessions.length, 1);
  assert.equal(fresh.state.bodyweights[0].weight, 179.7);
  assert.deepEqual(fresh.state, s.state);
});

test('importing junk throws instead of wiping the data', () => {
  const s = newStore();
  s.addBodyweight(179.7, '2026-09-09');
  assert.throws(() => s.importJSON('not json'));
  assert.throws(() => s.importJSON('{"nope":true}'));
  assert.equal(s.state.bodyweights.length, 1, 'existing data survived the bad import');
});

test('corrupt storage falls back to a clean state rather than crashing', () => {
  const backend = memoryBackend({ [STORAGE_KEY]: '{{{ not json' });
  const s = new Store(backend);
  assert.deepEqual(s.state.sessions, []);
  assert.equal(s.state.settings.programId, 'block-a');
});

test('migrate fills in fields missing from an old payload', () => {
  const m = migrate({ sessions: [{ id: 'x', date: '2026-01-01', entries: [] }] });
  assert.equal(m.version, 1);
  assert.ok(m.settings.programId);
  assert.deepEqual(m.bodyweights, []);
  assert.deepEqual(m.metrics, []);
});

test('reset clears everything back to defaults', () => {
  const s = newStore();
  s.addBodyweight(179.7, '2026-09-09');
  s.reset();
  assert.deepEqual(s.state, defaultState());
});

test('subscribers fire on every write and can unsubscribe', () => {
  const s = newStore();
  let calls = 0;
  const off = s.subscribe(() => calls++);
  s.addBodyweight(179.7, '2026-09-09');
  s.addBodyweight(180.0, '2026-09-10');
  assert.equal(calls, 2);
  off();
  s.addBodyweight(180.5, '2026-09-11');
  assert.equal(calls, 2);
});

test('today() returns a local ISO date, not a UTC-shifted one', () => {
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(today(new Date(2026, 8, 9, 23, 30)), '2026-09-09');
});

test('every day of every program can be started', () => {
  for (const program of Object.values(PROGRAMS)) {
    for (const day of program.days) {
      const s = newStore();
      const session = s.startSession(day, '2026-09-09');
      assert.equal(session.entries.length, day.exercises.length);
    }
  }
});

test('every source module is included in the published bundle', async () => {
  // A module missing from the bundler builds fine and ships broken, so this
  // guard runs in the unit suite where it fails fast.
  const { assertAllModulesBundled } = await import('../../scripts/bundle.js');
  await assertAllModulesBundled();
});

// --------------------------------------------------- storage that fights back
import { safeBackend } from '../../src/core/store.js';

/** A localStorage that throws on write, as iOS Safari does in a blocked iframe. */
const hostileBackend = () => ({
  getItem: () => null,
  setItem: () => {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  },
  removeItem: () => {},
});

test('a browser that blocks storage does not stop a set being logged', () => {
  const store = new Store(safeBackend(hostileBackend()));
  const day = getDay('block-a', 'legs');
  store.startSession(day, '2026-09-10');
  store.setSet('back-squat', 0, { weight: 225, reps: 5, done: true });
  const entry = store.state.active.entries.find((e) => e.exerciseId === 'back-squat');
  assert.equal(entry.sets[0].weight, 225, 'the set was recorded despite storage throwing');
  assert.equal(entry.sets[0].done, true);
});

test('a whole workout can still be finished with storage blocked', () => {
  const store = new Store(safeBackend(hostileBackend()));
  const day = getDay('block-a', 'legs');
  store.startSession(day, '2026-09-10');
  store.setSet('back-squat', 0, { weight: 225, reps: 5, done: true });
  const done = store.finishSession();
  assert.ok(done, 'finishing worked');
  assert.equal(store.state.sessions.length, 1);
  assert.equal(store.state.active, null);
});

test('blocked storage is reported rather than hidden', () => {
  const store = new Store(safeBackend(hostileBackend()));
  assert.equal(store.persistent, false);
  const healthy = new Store(safeBackend(memoryBackend()));
  assert.equal(healthy.persistent, true);
});

test('storage revoked mid-session degrades instead of throwing', () => {
  let allow = true;
  const flaky = {
    data: {},
    getItem(k) {
      return this.data[k] ?? null;
    },
    setItem(k, v) {
      if (!allow) throw new Error('storage revoked');
      this.data[k] = v;
    },
    removeItem(k) {
      delete this.data[k];
    },
  };
  const store = new Store(safeBackend(flaky));
  store.addBodyweight(179.7, '2026-09-10');
  assert.equal(store.persistent, true);

  allow = false;
  store.addBodyweight(180.1, '2026-09-11');
  assert.equal(store.state.bodyweights.length, 2, 'the entry was still recorded');
  assert.equal(store.persistent, false, 'and the failure is now reported');
});

test('one broken subscriber cannot stop the others or the save', () => {
  const store = new Store(safeBackend(memoryBackend()));
  let reached = 0;
  store.subscribe(() => {
    throw new Error('a listener blew up');
  });
  store.subscribe(() => {
    reached += 1;
  });
  store.addBodyweight(179.7, '2026-09-10');
  assert.equal(reached, 1);
  assert.equal(store.state.bodyweights.length, 1);
});

// ------------------------------------------- reps pre-filled, weight left open
test('a new session arrives with reps filled and weight blank', () => {
  const store = new Store(safeBackend(memoryBackend()));
  const day = getDay('block-a', 'push');
  store.startSession(day, '2026-09-10', (e) => e.repRange[0]);
  for (const entry of store.state.active.entries) {
    for (const set of entry.sets) {
      assert.equal(set.reps, '6', `${entry.exerciseId} should arrive with reps filled`);
      assert.equal(set.weight, '', `${entry.exerciseId} weight is the user's to enter`);
      assert.equal(set.done, false);
    }
  }
});

test('pre-filled reps do not become phantom sets on finish', () => {
  const store = new Store(safeBackend(memoryBackend()));
  const day = getDay('block-a', 'push');
  store.startSession(day, '2026-09-10', (e) => e.repRange[0]);
  // Complete exactly one set; every other row still holds pre-filled reps.
  store.setSet('bench-press', 0, { weight: 225, done: true });
  const done = store.finishSession();
  assert.equal(done.entries.length, 1, 'only the exercise actually worked is saved');
  assert.equal(done.entries[0].sets.length, 1, 'only the set actually ticked is saved');
});

test('every lift is two sets of six to eight', () => {
  for (const program of Object.values(PROGRAMS)) {
    for (const day of program.days) {
      for (const e of day.exercises) {
        assert.equal(e.sets, 2, `${e.id} should be 2 sets`);
        if (e.unit === 'sec') continue;
        assert.deepEqual(e.repRange, [6, 8], `${e.id} should be 6-8 reps`);
      }
    }
  }
});

test('a third set is one tap and inherits the row above it', () => {
  const store = new Store(safeBackend(memoryBackend()));
  const day = getDay('block-a', 'push');
  store.startSession(day, '2026-09-10', (e) => e.repRange[0]);
  store.setSet('bench-press', 1, { weight: 225, reps: 8, done: true });
  store.addSet('bench-press');
  const sets = store.state.active.entries[0].sets;
  assert.equal(sets.length, 3);
  assert.equal(sets[2].weight, 225);
  assert.equal(sets[2].reps, 8);
  assert.equal(sets[2].done, false);
});
