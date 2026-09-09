// Persistence. Backed by localStorage in the browser; any object with the
// getItem/setItem shape works, which is what makes it unit-testable in node.

import { DEFAULT_PROGRAM_ID } from './programs.js';

export const STORAGE_KEY = 'zolf-lift:v1';
export const SCHEMA_VERSION = 1;

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
  return {
    version: SCHEMA_VERSION,
    updatedAt: 0,
    settings: {
      programId: DEFAULT_PROGRAM_ID,
      activityId: 'moderate',
      phaseId: 'bulk',
      bodyFatCeiling: 20,
      restSeconds: 150,
      units: 'lb',
    },
    sessions: [],
    metrics: [],
    bodyweights: [],
    active: null,
  };
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export class Store {
  constructor(backend) {
    this.backend = backend;
    this.listeners = new Set();
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

  save() {
    this.backend.setItem(STORAGE_KEY, JSON.stringify(this.state));
    for (const fn of this.listeners) fn(this.state);
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
  startSession(day, date = today()) {
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
        sets: Array.from({ length: e.sets }, () => ({ weight: '', reps: '', rpe: '', done: false })),
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
        const last = entry.sets[entry.sets.length - 1];
        entry.sets.push({ weight: last?.weight ?? '', reps: '', rpe: '', done: false });
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
    active: raw.active || null,
  };
  state.sessions.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  state.bodyweights.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  state.metrics.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return state;
}
