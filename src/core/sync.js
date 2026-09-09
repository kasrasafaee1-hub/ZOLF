// Cross-device sync.
//
// localStorage stays the source of truth for the current tab: it is
// synchronous, works offline, and every reducer in store.js is built on it.
// This layer mirrors that state into the artifact `db` document so the log
// survives a cleared browser and follows you between phone and laptop.
//
// mergeStates is pure so the conflict rules can be tested without a network.

/** Union two lists keyed by `key`, preferring entries from the newer state. */
function unionBy(localList, remoteList, key, localWins) {
  const out = new Map();
  const first = localWins ? remoteList : localList;
  const second = localWins ? localList : remoteList;
  for (const item of first || []) out.set(item[key], item);
  for (const item of second || []) out.set(item[key], item);
  return [...out.values()];
}

/**
 * Merge a local and a remote snapshot without losing work from either side.
 *
 * Sessions are unioned by id, so a workout logged on one device can never be
 * erased by a stale snapshot from another. Bodyweights and scans are unioned by
 * date, since the app keeps one of each per day. Single-valued fields
 * (settings, the in-progress workout) follow whichever snapshot is newer.
 */
export function mergeStates(local, remote) {
  if (!remote) return local;
  if (!local) return remote;

  const localAt = Number(local.updatedAt) || 0;
  const remoteAt = Number(remote.updatedAt) || 0;
  const localWins = localAt >= remoteAt;
  const newer = localWins ? local : remote;

  const sessions = unionBy(local.sessions, remote.sessions, 'id', localWins).sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
  const bodyweights = unionBy(local.bodyweights, remote.bodyweights, 'date', localWins).sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
  const metrics = unionBy(local.metrics, remote.metrics, 'date', localWins).sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );

  return {
    ...newer,
    sessions,
    bodyweights,
    metrics,
    settings: { ...(localWins ? remote.settings : local.settings), ...(newer.settings || {}) },
    active: newer.active ?? null,
    updatedAt: Math.max(localAt, remoteAt),
  };
}

/** True when two snapshots would produce identical stored documents. */
export function sameState(a, b) {
  return JSON.stringify(stripVolatile(a)) === JSON.stringify(stripVolatile(b));
}

const stripVolatile = (s) => {
  if (!s) return s;
  const { updatedAt, ...rest } = s;
  return rest;
};

export const DOC_PATH = 'log/state';

/**
 * Mirrors a Store into a db document and back.
 *
 * Every method tolerates the capability being absent or failing: this is a
 * convenience layer over storage that already works, so a sync error must
 * never take the app down or block a set from being logged.
 */
export class Syncer {
  /**
   * @param {object} store        a Store instance
   * @param {object} opts.db      the resolved `db` capability, or null
   * @param {number} opts.debounceMs how long to batch writes
   */
  constructor(store, { db, debounceMs = 900, onStatus = () => {}, onRemoteChange = () => {} } = {}) {
    this.store = store;
    this.db = db;
    this.debounceMs = debounceMs;
    this.onStatus = onStatus;
    // Fired only when data arrives from elsewhere. The UI re-renders on this
    // and not on every local write, which would steal focus mid-keystroke.
    this.onRemoteChange = onRemoteChange;
    this.timer = null;
    this.lastPushed = null;
    this.unsubscribes = [];
    this.status = 'offline';
  }

  setStatus(status, detail) {
    this.status = status;
    try {
      this.onStatus(status, detail);
    } catch {
      /* a status listener must never break sync */
    }
  }

  /** Pull, merge, push, then watch. Safe to call when db is null. */
  async start() {
    if (!this.db) return this.setStatus('offline');
    this.setStatus('syncing');
    try {
      const doc = this.db.doc(DOC_PATH);
      const snapshot = await doc.get();
      const remote = snapshot?.data ?? snapshot ?? null;
      const merged = mergeStates(this.store.state, remote?.state ? remote.state : remote);
      if (merged && !sameState(merged, this.store.state)) {
        this.applyRemote(merged);
      }
      await this.push(true);
      this.watch(doc);
      this.unsubscribes.push(this.store.subscribe(() => this.schedulePush()));
      this.setStatus('synced');
    } catch (err) {
      this.setStatus('error', err);
    }
  }

  watch(doc) {
    if (typeof doc.onSnapshot !== 'function') return;
    try {
      const off = doc.onSnapshot((snapshot) => {
        const remote = snapshot?.data ?? snapshot ?? null;
        const incoming = remote?.state ? remote.state : remote;
        if (!incoming) return;
        const merged = mergeStates(this.store.state, incoming);
        if (!sameState(merged, this.store.state)) this.applyRemote(merged);
      });
      if (typeof off === 'function') this.unsubscribes.push(off);
    } catch {
      /* watching is best effort */
    }
  }

  applyRemote(merged) {
    this.store.state = merged;
    this.store.save();
    try {
      this.onRemoteChange(merged);
    } catch {
      /* a listener must never break sync */
    }
  }

  schedulePush() {
    if (!this.db) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.push(), this.debounceMs);
  }

  async push(force = false) {
    if (!this.db) return false;
    const state = this.store.state;
    if (!force && this.lastPushed && sameState(this.lastPushed, state)) return false;
    try {
      this.setStatus('syncing');
      await this.db.doc(DOC_PATH).set({ state, updatedAt: Date.now() });
      this.lastPushed = structuredClone(state);
      this.setStatus('synced');
      return true;
    } catch (err) {
      this.setStatus('error', err);
      return false;
    }
  }

  stop() {
    clearTimeout(this.timer);
    for (const off of this.unsubscribes) {
      try {
        off();
      } catch {
        /* ignore */
      }
    }
    this.unsubscribes = [];
  }
}
