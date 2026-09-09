// Set math, progression suggestions, PR detection, volume analysis.

/** Epley estimated 1RM. Reps above 12 get unreliable, so we cap the input. */
export function estimated1RM(weight, reps) {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return 0;
  const r = Math.min(reps, 12);
  return Math.round(weight * (1 + r / 30) * 10) / 10;
}

export const isCompleted = (s) => !!s && s.done && Number(s.reps) > 0;

export function sessionVolume(session) {
  let v = 0;
  for (const entry of session?.entries || []) {
    for (const s of entry.sets || []) {
      if (isCompleted(s)) v += Number(s.weight || 0) * Number(s.reps);
    }
  }
  return Math.round(v);
}

export function sessionHardSets(session) {
  let n = 0;
  for (const entry of session?.entries || []) {
    for (const s of entry.sets || []) if (isCompleted(s)) n += 1;
  }
  return n;
}

/** Best set of an entry, ranked by estimated 1RM. */
export function bestSet(entry) {
  let best = null;
  for (const s of entry?.sets || []) {
    if (!isCompleted(s)) continue;
    const e1 = estimated1RM(Number(s.weight), Number(s.reps));
    if (!best || e1 > best.e1rm) best = { weight: Number(s.weight), reps: Number(s.reps), e1rm: e1 };
  }
  return best;
}

/**
 * Double progression.
 * Every completed set at or above the top of the rep range -> add weight.
 * Any completed set below the bottom -> drop weight.
 * Otherwise keep the weight and chase reps.
 */
export function suggestNext(lastEntry, exercise) {
  const [low, high] = exercise?.repRange || [8, 12];
  const done = (lastEntry?.sets || []).filter(isCompleted);
  if (!done.length) {
    return { weight: null, reps: low, reason: 'First time — pick a weight you can control for ' + low + ' reps.' };
  }

  const weights = done.map((s) => Number(s.weight) || 0);
  const topWeight = Math.max(...weights);
  const atTop = done.filter((s) => Number(s.weight) === topWeight);
  const increment = exercise?.type === 'compound' ? (isLowerBody(exercise) ? 10 : 5) : 5;

  if (atTop.every((s) => Number(s.reps) >= high)) {
    return {
      weight: round2p5(topWeight + increment),
      reps: low,
      reason: `Hit ${high} reps on every set — add ${increment} lb and rebuild to ${high}.`,
    };
  }
  if (atTop.some((s) => Number(s.reps) < low)) {
    return {
      weight: round2p5(Math.max(0, topWeight - increment)),
      reps: low,
      reason: `Fell under ${low} reps — drop ${increment} lb and earn it back.`,
    };
  }
  const minReps = Math.min(...atTop.map((s) => Number(s.reps)));
  return {
    weight: topWeight,
    reps: Math.min(high, minReps + 1),
    reason: `Same weight — beat ${minReps} reps on your worst set.`,
  };
}

const isLowerBody = (e) => ['quads', 'hamstrings', 'glutes'].includes(e?.muscle);
const round2p5 = (w) => Math.round(w * 2) / 2;

/**
 * Personal records for one exercise across history, oldest first.
 * @returns {{e1rm:number, weight:number, reps:number, date:string}|null}
 */
export function exercisePR(sessions, exerciseId) {
  let pr = null;
  for (const s of sessions || []) {
    const entry = (s.entries || []).find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    const b = bestSet(entry);
    if (b && (!pr || b.e1rm > pr.e1rm)) pr = { ...b, date: s.date };
  }
  return pr;
}

/** True when this session set a new estimated-1RM record vs everything before it. */
export function isNewPR(sessions, session, exerciseId) {
  const prior = (sessions || []).filter((s) => s.id !== session.id && s.date <= session.date);
  const before = exercisePR(prior, exerciseId);
  const entry = (session.entries || []).find((e) => e.exerciseId === exerciseId);
  const now = entry ? bestSet(entry) : null;
  if (!now) return false;
  return !before || now.e1rm > before.e1rm;
}

/** Estimated-1RM series for charting, one point per session. */
export function e1rmSeries(sessions, exerciseId) {
  return (sessions || [])
    .map((s) => {
      const entry = (s.entries || []).find((e) => e.exerciseId === exerciseId);
      const b = entry ? bestSet(entry) : null;
      return b ? { date: s.date, value: b.e1rm } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Completed hard sets per muscle over the last `days` days. */
export function volumeByMuscle(sessions, exerciseIndex, days = 7, now = new Date()) {
  const cutoff = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  const out = {};
  for (const s of sessions || []) {
    if (s.date < cutoff) continue;
    for (const entry of s.entries || []) {
      const muscle = exerciseIndex[entry.exerciseId]?.muscle || entry.muscle || 'other';
      const n = (entry.sets || []).filter(isCompleted).length;
      if (n) out[muscle] = (out[muscle] || 0) + n;
    }
  }
  return out;
}

// Weekly hard-set landmarks for hypertrophy (Israetel-style ranges).
export const VOLUME_LANDMARKS = {
  quads: [8, 20],
  hamstrings: [6, 16],
  glutes: [4, 16],
  calves: [6, 20],
  chest: [8, 22],
  back: [10, 25],
  shoulders: [8, 22],
  biceps: [6, 18],
  triceps: [6, 18],
  core: [6, 20],
};

/**
 * Flags muscles under the minimum effective volume or past the point where
 * extra sets stop paying. Sorted worst-first so the UI can lead with it.
 */
export function volumeAudit(volume) {
  const rows = [];
  for (const [muscle, [min, max]] of Object.entries(VOLUME_LANDMARKS)) {
    const sets = volume[muscle] || 0;
    let status = 'ok';
    let note = `${sets} sets — in range (${min}-${max}).`;
    if (sets < min) {
      status = 'low';
      note = `${sets} sets — below ${min}, not enough to grow.`;
    } else if (sets > max) {
      status = 'high';
      note = `${sets} sets — above ${max}, past the useful range.`;
    }
    rows.push({ muscle, sets, min, max, status, note });
  }
  const rank = { low: 0, high: 1, ok: 2 };
  return rows.sort((a, b) => rank[a.status] - rank[b.status] || b.sets - a.sets);
}

/** Flat id -> exercise map across every day of a program. */
export function buildExerciseIndex(program) {
  const idx = {};
  for (const day of program?.days || []) {
    for (const e of day.exercises) idx[e.id] = e;
  }
  return idx;
}
