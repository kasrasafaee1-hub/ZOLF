import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeStates, sameState, Syncer, DOC_PATH } from '../../src/core/sync.js';
import { Store, memoryBackend, defaultState } from '../../src/core/store.js';
import { getDay } from '../../src/core/programs.js';

const session = (id, date) => ({
  id,
  date,
  dayId: 'legs',
  dayName: 'Legs',
  entries: [{ exerciseId: 'back-squat', name: 'Back Squat', muscle: 'quads', sets: [{ weight: 185, reps: 8, done: true }] }],
});

const state = (over = {}) => ({ ...defaultState(), ...over });

// ------------------------------------------------------------------ merging

test('merging against nothing returns the other side unchanged', () => {
  const s = state({ updatedAt: 5 });
  assert.equal(mergeStates(s, null), s);
  assert.equal(mergeStates(null, s), s);
});

test('workouts from both devices survive the merge', () => {
  const local = state({ updatedAt: 20, sessions: [session('a', '2026-09-01')] });
  const remote = state({ updatedAt: 10, sessions: [session('b', '2026-09-02')] });
  const merged = mergeStates(local, remote);
  assert.deepEqual(merged.sessions.map((s) => s.id), ['a', 'b']);
});

test('a stale snapshot can never delete a session the other side has', () => {
  const local = state({ updatedAt: 100, sessions: [session('a', '2026-09-01'), session('b', '2026-09-02')] });
  const remote = state({ updatedAt: 1, sessions: [] });
  assert.equal(mergeStates(local, remote).sessions.length, 2);
  assert.equal(mergeStates(remote, local).sessions.length, 2);
});

test('merged sessions come back in date order', () => {
  const local = state({ updatedAt: 2, sessions: [session('c', '2026-09-15')] });
  const remote = state({ updatedAt: 1, sessions: [session('a', '2026-09-01'), session('b', '2026-09-08')] });
  assert.deepEqual(
    mergeStates(local, remote).sessions.map((s) => s.date),
    ['2026-09-01', '2026-09-08', '2026-09-15']
  );
});

test('the same session id from both sides resolves to the newer snapshot', () => {
  const older = { ...session('a', '2026-09-01'), note: 'from the old device' };
  const newer = { ...session('a', '2026-09-01'), note: 'edited later' };
  const local = state({ updatedAt: 50, sessions: [newer] });
  const remote = state({ updatedAt: 10, sessions: [older] });
  assert.equal(mergeStates(local, remote).sessions[0].note, 'edited later');
  assert.equal(mergeStates(remote, local).sessions[0].note, 'edited later');
});

test('bodyweights and scans merge by date, one per day', () => {
  const local = state({
    updatedAt: 20,
    bodyweights: [{ id: '1', date: '2026-09-01', weight: 179 }],
    metrics: [{ id: 'm1', date: '2026-09-01', weight: 179, bodyFatPct: 16.5 }],
  });
  const remote = state({
    updatedAt: 10,
    bodyweights: [{ id: '2', date: '2026-09-02', weight: 180 }],
    metrics: [{ id: 'm2', date: '2026-12-01', weight: 186, bodyFatPct: 18 }],
  });
  const merged = mergeStates(local, remote);
  assert.deepEqual(merged.bodyweights.map((b) => b.date), ['2026-09-01', '2026-09-02']);
  assert.deepEqual(merged.metrics.map((m) => m.date), ['2026-09-01', '2026-12-01']);
});

test('two weigh-ins for one day collapse to the newer snapshot', () => {
  const local = state({ updatedAt: 99, bodyweights: [{ id: '1', date: '2026-09-01', weight: 181 }] });
  const remote = state({ updatedAt: 1, bodyweights: [{ id: '2', date: '2026-09-01', weight: 179 }] });
  const merged = mergeStates(local, remote);
  assert.equal(merged.bodyweights.length, 1);
  assert.equal(merged.bodyweights[0].weight, 181);
});

test('settings follow the newer snapshot but keep keys only the older one has', () => {
  const local = state({ updatedAt: 99, settings: { ...defaultState().settings, phaseId: 'cut' } });
  const remote = state({ updatedAt: 1, settings: { ...defaultState().settings, phaseId: 'bulk', restSeconds: 240 } });
  const merged = mergeStates(local, remote);
  assert.equal(merged.settings.phaseId, 'cut');
  assert.equal(merged.settings.restSeconds, 150, 'the newer snapshot still wins on shared keys');
});

test('an in-progress workout follows the device that touched it last', () => {
  const active = { id: 'live', dayId: 'legs', entries: [] };
  const local = state({ updatedAt: 5 });
  const remote = state({ updatedAt: 50, active });
  assert.equal(mergeStates(local, remote).active.id, 'live');
  assert.equal(mergeStates(remote, local).active.id, 'live');
});

test('merged updatedAt is the newer of the two', () => {
  assert.equal(mergeStates(state({ updatedAt: 7 }), state({ updatedAt: 90 })).updatedAt, 90);
});

test('a snapshot missing updatedAt is treated as the older one', () => {
  const local = state({ updatedAt: 10, sessions: [session('a', '2026-09-01')] });
  const remote = { sessions: [session('b', '2026-09-02')] };
  const merged = mergeStates(local, remote);
  assert.equal(merged.sessions.length, 2);
  assert.equal(merged.settings.programId, 'block-a', 'the well-formed side supplies the settings');
});

test('sameState ignores the timestamp', () => {
  assert.ok(sameState(state({ updatedAt: 1 }), state({ updatedAt: 999 })));
  assert.ok(!sameState(state({ sessions: [session('a', '2026-09-01')] }), state()));
});

// ------------------------------------------------------------------- syncer

/** A stand-in for the db capability. */
function fakeDb(initial = null) {
  const store = { doc: initial };
  const watchers = [];
  const calls = { get: 0, set: 0 };
  return {
    calls,
    watchers,
    push(value) {
      store.doc = value;
      for (const fn of watchers) fn(value);
    },
    doc(path) {
      assert.equal(path, DOC_PATH);
      return {
        async get() {
          calls.get += 1;
          return store.doc;
        },
        async set(value) {
          calls.set += 1;
          store.doc = value;
        },
        onSnapshot(fn) {
          watchers.push(fn);
          return () => watchers.splice(watchers.indexOf(fn), 1);
        },
      };
    },
  };
}

const newStore = () => new Store(memoryBackend());
const legDay = getDay('block-a', 'legs');

test('start pushes local state up when the remote is empty', async () => {
  const store = newStore();
  store.addBodyweight(179.7, '2026-09-09');
  const db = fakeDb(null);
  const syncer = new Syncer(store, { db, debounceMs: 5 });
  await syncer.start();
  assert.equal(db.calls.set, 1);
  assert.equal(syncer.status, 'synced');
  syncer.stop();
});

test('start pulls remote workouts down into an empty local store', async () => {
  const store = newStore();
  const db = fakeDb({ state: { ...defaultState(), updatedAt: 500, sessions: [session('remote1', '2026-09-01')] }, updatedAt: 500 });
  const syncer = new Syncer(store, { db, debounceMs: 5 });
  await syncer.start();
  assert.equal(store.state.sessions.length, 1);
  assert.equal(store.state.sessions[0].id, 'remote1');
  syncer.stop();
});

test('start merges both sides rather than picking one', async () => {
  const store = newStore();
  store.update((s) => ({ ...s, sessions: [session('local1', '2026-09-05')] }));
  const db = fakeDb({ state: { ...defaultState(), updatedAt: 1, sessions: [session('remote1', '2026-09-01')] } });
  const syncer = new Syncer(store, { db, debounceMs: 5 });
  await syncer.start();
  assert.deepEqual(store.state.sessions.map((s) => s.id), ['remote1', 'local1']);
  syncer.stop();
});

test('a later write from another device arrives through the watcher', async () => {
  const store = newStore();
  const db = fakeDb(null);
  const syncer = new Syncer(store, { db, debounceMs: 5 });
  await syncer.start();
  db.push({ state: { ...defaultState(), updatedAt: Date.now() + 10000, sessions: [session('phone', '2026-09-07')] } });
  assert.equal(store.state.sessions.length, 1);
  assert.equal(store.state.sessions[0].id, 'phone');
  syncer.stop();
});

test('local edits are pushed after the debounce settles', async () => {
  const store = newStore();
  const db = fakeDb(null);
  const syncer = new Syncer(store, { db, debounceMs: 10 });
  await syncer.start();
  const before = db.calls.set;
  store.startSession(legDay, '2026-09-09');
  store.setSet('back-squat', 0, { weight: 185, reps: 8, done: true });
  store.finishSession();
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(db.calls.set > before, 'the finished workout reached the server');
  syncer.stop();
});

test('rapid edits collapse into a single write', async () => {
  const store = newStore();
  const db = fakeDb(null);
  const syncer = new Syncer(store, { db, debounceMs: 25 });
  await syncer.start();
  const before = db.calls.set;
  for (let i = 1; i <= 8; i++) store.addBodyweight(179 + i / 10, `2026-09-0${i}`);
  await new Promise((r) => setTimeout(r, 90));
  assert.equal(db.calls.set - before, 1, 'eight edits produced one write');
  syncer.stop();
});

test('a push with nothing new to say is skipped', async () => {
  const store = newStore();
  const db = fakeDb(null);
  const syncer = new Syncer(store, { db, debounceMs: 5 });
  await syncer.start();
  const before = db.calls.set;
  assert.equal(await syncer.push(), false);
  assert.equal(db.calls.set, before);
  syncer.stop();
});

test('no db capability leaves the app fully working and offline', async () => {
  const store = newStore();
  const syncer = new Syncer(store, { db: null });
  await syncer.start();
  assert.equal(syncer.status, 'offline');
  store.addBodyweight(179.7, '2026-09-09');
  assert.equal(store.state.bodyweights.length, 1);
  syncer.stop();
});

test('a failing server never takes the local log down', async () => {
  const store = newStore();
  const brokenDb = {
    doc: () => ({
      get: async () => {
        throw new Error('network down');
      },
      set: async () => {
        throw new Error('network down');
      },
    }),
  };
  const syncer = new Syncer(store, { db: brokenDb, debounceMs: 5 });
  await syncer.start();
  assert.equal(syncer.status, 'error');
  store.addBodyweight(179.7, '2026-09-09');
  assert.equal(store.state.bodyweights.length, 1, 'logging still works with the server down');
  assert.equal(await syncer.push(), false);
  syncer.stop();
});

test('a broken status listener cannot break sync', async () => {
  const store = newStore();
  const syncer = new Syncer(store, {
    db: fakeDb(null),
    debounceMs: 5,
    onStatus: () => {
      throw new Error('listener blew up');
    },
  });
  await syncer.start();
  assert.equal(syncer.status, 'synced');
  syncer.stop();
});

test('stop unsubscribes so a stopped syncer stops writing', async () => {
  const store = newStore();
  const db = fakeDb(null);
  const syncer = new Syncer(store, { db, debounceMs: 10 });
  await syncer.start();
  syncer.stop();
  const before = db.calls.set;
  store.addBodyweight(179.7, '2026-09-09');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(db.calls.set, before);
});

// ------------------------------------------------- snapshot shapes and safety
import { unwrapSnapshot, isStateLike } from '../../src/core/sync.js';

const realState = () => ({ ...defaultState(), updatedAt: 500, sessions: [session('s1', '2026-09-01')] });

test('a state is recognised, a wrapper object is not', () => {
  assert.ok(isStateLike(defaultState()));
  assert.ok(isStateLike({ sessions: [] }));
  assert.ok(isStateLike({ settings: { programId: 'x' } }));
  assert.ok(!isStateLike(null));
  assert.ok(!isStateLike('nope'));
  assert.ok(!isStateLike([]));
  assert.ok(!isStateLike({ id: 'log/state', exists: true }));
});

test('the payload is found however the document API returns it', () => {
  const state = realState();
  // Returned directly.
  assert.equal(unwrapSnapshot(state)?.sessions.length, 1);
  // Wrapped the way we write it.
  assert.equal(unwrapSnapshot({ state, updatedAt: 9 })?.sessions.length, 1);
  // Behind a data property.
  assert.equal(unwrapSnapshot({ data: { state, updatedAt: 9 } })?.sessions.length, 1);
  // Behind a Firestore-style data() method — the shape that silently
  // produced a function where a state was expected.
  assert.equal(unwrapSnapshot({ exists: true, data: () => ({ state, updatedAt: 9 }) })?.sessions.length, 1);
});

test('anything unrecognisable is refused rather than merged', () => {
  assert.equal(unwrapSnapshot(null), null);
  assert.equal(unwrapSnapshot(undefined), null);
  assert.equal(unwrapSnapshot('a string'), null);
  assert.equal(unwrapSnapshot({ exists: false }), null);
  assert.equal(unwrapSnapshot({ id: 'log/state' }), null);
  assert.equal(
    unwrapSnapshot({
      data: () => {
        throw new Error('boom');
      },
    }),
    null
  );
});

test('an in-progress workout is never dropped by a remote snapshot', () => {
  const active = { id: 'live', dayId: 'legs', entries: [{ exerciseId: 'back-squat', sets: [{ weight: 185, reps: 8, done: true }] }] };
  const local = { ...defaultState(), updatedAt: 10, active };
  const remoteNewer = { ...defaultState(), updatedAt: 99999, active: null };
  assert.equal(mergeStates(local, remoteNewer).active?.id, 'live', 'a newer remote must not wipe live sets');
});

test('a remote in-progress workout is adopted when this device has none', () => {
  const active = { id: 'phone', dayId: 'legs', entries: [] };
  const local = { ...defaultState(), updatedAt: 99999, active: null };
  const remote = { ...defaultState(), updatedAt: 1, active };
  assert.equal(mergeStates(local, remote).active?.id, 'phone');
});

test('a garbage snapshot cannot destroy a finished session', async () => {
  const store = newStore();
  store.startSession(legDay, '2026-09-09');
  store.setSet('back-squat', 0, { weight: 185, reps: 8, done: true });
  store.finishSession();

  const junkDb = {
    doc: () => ({
      get: async () => ({ id: 'log/state', exists: true }),
      set: async () => {},
      onSnapshot: (fn) => {
        setTimeout(() => fn({ id: 'log/state' }), 0);
        return () => {};
      },
    }),
  };
  const syncer = new Syncer(store, { db: junkDb, debounceMs: 5 });
  await syncer.start();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(store.state.sessions.length, 1, 'the workout survived an unreadable snapshot');
  syncer.stop();
});
