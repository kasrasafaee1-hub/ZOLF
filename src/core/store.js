// Persistence. Backed by localStorage in the browser; any object with the
// getItem/setItem shape works, which is what makes it unit-testable in node.

import { DEFAULT_PROGRAM_ID } from './programs.js';
import { PROFILE_ID } from './profile.js';
import { getProfile } from './profiles.js';

export const STORAGE_KEY = 'zolf-lift:v1';
export const SCHEMA_VERSION = 1;

/**
 * localStorage that cannot take the app down with it.
 *
 * An artifact runs in a sandboxed cross-origin iframe. iOS Safari — in Private
 * Browsing, with site data blocked, or simply with partitioned third-party
 * storage — makes `localStorage.setItem` THROW there. An unguarded write meant
 * every mutation threw out of its click handler, so taps did nothing at all.
 * Persistence is a convenience; logging a set is not. When the real store is
 * unusable we fall back to memory and say so, rather than failing.
 */
export function safeBackend(candidate) {
  const memory = memoryBackend();
  let usable = false;
  try {
    const probe = '__zolf_probe__';
    candidate.setItem(probe, '1');
    candidate.removeItem(probe);
    usable = true;
  } catch {
    usable = false;
  }

  const store = usable ? candidate : memory;
  const backend = {
    persistent: usable,
    lastError: usable ? null : 'This browser is blocking storage for this page.',
    getItem(key) {
      try {
        return store.getItem(key);
      } catch (err) {
        backend.persistent = false;
        backend.lastError = String(err?.message || err);
        return memory.getItem(key);
      }
    },
    setItem(key, value) {
      try {
        store.setItem(key, value);
      } catch (err) {
        // Quota, or storage revoked mid-session. Keep going in memory.
        backend.persistent = false;
        backend.lastError = String(err?.message || err);
        memory.setItem(key, value);
      }
    },
    removeItem(key) {
      try {
        store.removeItem(key);
      } catch {
        memory.removeItem(key);
      }
    },
  };
  return backend;
}

export function memoryBackend(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

export function defaultState() {
  const profile = getProfile(PROFILE_ID);
  return {
    version: SCHEMA_VERSION,
    updatedAt: 0,
    settings: {
      programId: DEFAULT_PROGRAM_ID,
      activityId: profile.activityId,
      phaseId: 'bulk',
      // Calibrated to the profile: a woman's ceiling sits higher than a man's.
      bodyFatCeiling: profile.bodyFatCeiling,
      restSeconds: 150,
      units: 'lb',
      // Blocks alternate on a fixed cadence from the day the app is first
      // opened, so nobody has to remember to change programme.
      autoRotate: true,
      rotationWeeks: 2,
      rotationStart: today(),
    },
    sessions: [],
    metrics: [],
    bodyweights: [],
    protein: [],
    creatine: [],
    active: null,
  };
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export class Store {
  constructor(backend) {
    this.backend = backend;
    this.listeners = new Set();
    this.lastError = null;
    this.state = this.load();
  }

  load() {
    try {
      const raw = this.backend.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return migrate(parsed);
    } catch {
      return defaultState();
    }
  }

  /**
   * Persist, then notify. Neither step may throw: a storage failure must not
   * stop a set being logged, and one broken listener must not stop the others.
   */
  save() {
    try {
      this.backend.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (err) {
      this.lastError = String(err?.message || err);
    }
    for (const fn of [...this.listeners]) {
      try {
        fn(this.state);
      } catch (err) {
        this.lastError = String(err?.message || err);
      }
    }
  }

  /** Whether writes are actually reaching durable storage on this device. */
  get persistent() {
    return this.backend.persistent !== false;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  update(fn) {
    const next = fn(this.state);
    if (next) this.state = next;
    // Stamped on mutation, not on save, so import and reset reproduce their
    // source byte for byte. mergeStates uses this to settle conflicts.
    this.state = { ...this.state, updatedAt: Date.now() };
    this.save();
    return this.state;
  }

  // --- settings ---
  setSetting(key, value) {
    return this.update((s) => ({ ...s, settings: { ...s.settings, [key]: value } }));
  }

  // --- workout session lifecycle ---
  /**
   * @param day       the program day being started
   * @param date      ISO date for the session
   * @param prefill   (exercise) => reps to put in each row. Reps arrive filled
   *                  in so the only thing to type at the rack is the weight;
   *                  weight is deliberately left blank.
   */
  startSession(day, date = today(), prefill = null) {
    const session = {
      id: uid(),
      dayId: day.id,
      dayName: day.name,
      date,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      note: '',
      entries: day.exercises.map((e) => ({
        exerciseId: e.id,
        name: e.name,
        muscle: e.muscle,
        targetReps: e.repRange,
        sets: Array.from({ length: e.sets }, () => ({
          weight: '',
          reps: prefill ? String(prefill(e) ?? '') : '',
          rpe: '',
          done: false,
        })),
      })),
    };
    this.update((s) => ({ ...s, active: session }));
    return session;
  }

  updateActive(fn) {
    return this.update((s) => (s.active ? { ...s, active: fn(structuredClone(s.active)) } : s));
  }

  setSet(exerciseId, setIndex, patch) {
    return this.updateActive((a) => {
      const entry = a.entries.find((e) => e.exerciseId === exerciseId);
      if (!entry) return a;
      while (entry.sets.length <= setIndex) entry.sets.push({ weight: '', reps: '', rpe: '', done: false });
      entry.sets[setIndex] = { ...entry.sets[setIndex], ...patch };
      return a;
    });
  }

  addSet(exerciseId) {
    return this.updateActive((a) => {
      const entry = a.entries.find((e) => e.exerciseId === exerciseId);
      if (entry) {
        // An added set inherits the last one, so a third set is one tap.
        const last = entry.sets[entry.sets.length - 1];
        entry.sets.push({ weight: last?.weight ?? '', reps: last?.reps ?? '', rpe: '', done: false });
      }
      return a;
    });
  }

  removeSet(exerciseId, setIndex) {
    return this.updateActive((a) => {
      const entry = a.entries.find((e) => e.exerciseId === exerciseId);
      if (entry && entry.sets.length > 1) entry.sets.splice(setIndex, 1);
      return a;
    });
  }

  /** Drops empty sets and files the session into history. */
  finishSession() {
    const active = this.state.active;
    if (!active) return null;
    const entries = active.entries
      .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done && Number(s.reps) > 0) }))
      .filter((e) => e.sets.length);
    if (!entries.length) {
      this.update((s) => ({ ...s, active: null }));
      return null;
    }
    const done = { ...active, entries, finishedAt: new Date().toISOString() };
    this.update((s) => ({
      ...s,
      active: null,
      sessions: [...s.sessions, done].sort((a, b) => a.date.localeCompare(b.date)),
    }));
    return done;
  }

  discardSession() {
    return this.update((s) => ({ ...s, active: null }));
  }

  deleteSession(id) {
    return this.update((s) => ({ ...s, sessions: s.sessions.filter((x) => x.id !== id) }));
  }

  /** Most recent finished session containing this exercise. */
  lastEntryFor(exerciseId, excludeSessionId = null) {
    const sessions = [...this.state.sessions]
      .filter((s) => s.id !== excludeSessionId)
      .sort((a, b) => b.date.localeCompare(a.date));
    for (const s of sessions) {
      const entry = s.entries.find((e) => e.exerciseId === exerciseId);
      if (entry && entry.sets.length) return { entry, session: s };
    }
    return null;
  }

  // --- body data ---
  addBodyweight(weight, date = today()) {
    const w = Number(weight);
    if (!Number.isFinite(w) || w <= 0) return this.state;
    return this.update((s) => ({
      ...s,
      bodyweights: [...s.bodyweights.filter((b) => b.date !== date), { id: uid(), date, weight: w }].sort((a, b) =>
        a.date.localeCompare(b.date)
      ),
    }));
  }

  // --- daily fuel ---

  /** Protein is many entries a day, so each one is kept separately. */
  addProtein(grams, label = '', date = today()) {
    const g = Number(grams);
    if (!Number.isFinite(g) || g <= 0) return this.state;
    return this.update((s) => ({
      ...s,
      protein: [...s.protein, { id: uid(), date, grams: g, label: String(label || '') }],
    }));
  }

  removeProtein(id) {
    return this.update((s) => ({ ...s, protein: s.protein.filter((p) => p.id !== id) }));
  }

  /** Creatine is one dose a day; logging again replaces it. */
  setCreatine(grams, date = today()) {
    const g = Number(grams);
    const rest = this.state.creatine.filter((c) => c.date !== date);
    if (!Number.isFinite(g) || g <= 0) {
      return this.update((s) => ({ ...s, creatine: rest }));
    }
    return this.update((s) => ({
      ...s,
      creatine: [...rest, { id: uid(), date, grams: g }].sort((a, b) => a.date.localeCompare(b.date)),
    }));
  }

  addMetric(metric) {
    const m = { id: uid(), date: today(), ...metric };
    return this.update((s) => ({
      ...s,
      metrics: [...s.metrics.filter((x) => x.date !== m.date), m].sort((a, b) => a.date.localeCompare(b.date)),
    }));
  }

  deleteMetric(id) {
    return this.update((s) => ({ ...s, metrics: s.metrics.filter((m) => m.id !== id) }));
  }

  latestMetric() {
    return this.state.metrics.length ? this.state.metrics[this.state.metrics.length - 1] : null;
  }

  // --- backup ---
  exportJSON() {
    return JSON.stringify(this.state, null, 2);
  }

  importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.sessions)) {
      throw new Error('Not a valid backup file');
    }
    this.state = migrate(parsed);
    this.save();
    return this.state;
  }

  reset() {
    this.state = defaultState();
    this.save();
    return this.state;
  }
}

export function today(d = new Date()) {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

/** Fills in anything a stored or imported payload is missing. */
export function migrate(raw) {
  const base = defaultState();
  const state = {
    ...base,
    ...raw,
    version: SCHEMA_VERSION,
    updatedAt: Number(raw.updatedAt) || 0,
    settings: { ...base.settings, ...(raw.settings || {}) },
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    metrics: Array.isArray(raw.metrics) ? raw.metrics : [],
    bodyweights: Array.isArray(raw.bodyweights) ? raw.bodyweights : [],
    protein: Array.isArray(raw.protein) ? raw.protein : [],
    creatine: Array.isArray(raw.creatine) ? raw.creatine : [],
    active: raw.active || null,
  };
  state.sessions.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  state.bodyweights.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  state.metrics.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  state.protein.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  state.creatine.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return state;
}
