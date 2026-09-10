// Training programs.
//
// Block A is the split as it is actually run: Push / Pull / Legs / Full, with
// each exercise carrying its own rest, a role in the session, and the coaching
// cue that matters for it. Block B keeps the same four days and the same muscle
// groups but swaps the exercise selection, so a fortnightly rotation is a
// change of program rather than a rewrite.

/**
 * Every lift runs 2 sets of 6-8, by request: a short, heavy session where the
 * only thing to type at the rack is the weight. Timed holds keep seconds.
 *
 * @param id        stable across blocks — history and PRs are keyed on it, so
 *                  the same lift must keep the same id wherever it appears
 * @param role      primary | volume | isolation | strength | finisher | health | core
 * @param rest      seconds between sets, per this exercise
 * @param unit      'reps' (default), 'sec' for timed holds
 * @param perSide   true when the prescription is per leg or arm
 */
const ex = (id, name, muscle, sets, low, high, role, rest, opts = {}) => ({
  id,
  name,
  muscle,
  sets,
  repRange: [low, high],
  role,
  rest,
  cue: opts.cue || '',
  unit: opts.unit || 'reps',
  perSide: !!opts.perSide,
  type: role === 'isolation' || role === 'finisher' ? 'isolation' : 'compound',
});

export const MUSCLES = [
  'quads', 'hamstrings', 'glutes', 'calves',
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'core',
];

export const ROLES = {
  primary: { label: 'Primary', tone: 'primary' },
  strength: { label: 'Strength', tone: 'primary' },
  volume: { label: 'Volume', tone: 'volume' },
  isolation: { label: 'Isolation', tone: 'quiet' },
  finisher: { label: 'Finisher', tone: 'accent' },
  health: { label: 'Health', tone: 'accent' },
  core: { label: 'Core', tone: 'accent' },
};

export const PROGRAMS = {
  'block-a': {
    id: 'block-a',
    name: 'Block A — current',
    note: 'Push Mon / Pull Tue / Legs Thu / Full Sat',
    days: [
      {
        id: 'push',
        name: 'Push',
        schedule: 'Mon',
        focus: 'Chest · Shoulders · Triceps',
        patron: 'Zeus',
        exercises: [
          ex('bench-press', 'Barbell bench press', 'chest', 2, 6, 8, 'primary', 150),
          ex('incline-db-press', 'Incline dumbbell press', 'chest', 2, 6, 8, 'volume', 90),
          ex('ohp', 'Overhead barbell press', 'shoulders', 2, 6, 8, 'primary', 120),
          ex('cable-lateral', 'Cable lateral raise', 'shoulders', 2, 6, 8, 'isolation', 60, { cue: 'Slow eccentric' }),
          ex('rope-pushdown', 'Tricep rope pushdown', 'triceps', 2, 6, 8, 'isolation', 60, { cue: 'Elbows in' }),
          ex('overhead-ext', 'Overhead tricep extension', 'triceps', 2, 6, 8, 'isolation', 60, { cue: 'Long head stretch' }),
          ex('pec-deck', 'Pec deck / chest fly', 'chest', 2, 6, 8, 'finisher', 60, { cue: 'Pump finisher' }),
        ],
      },
      {
        id: 'pull',
        name: 'Pull',
        schedule: 'Tue',
        focus: 'Back · Biceps · Rear delts',
        patron: 'Herakles',
        exercises: [
          ex('deadlift', 'Barbell deadlift', 'back', 2, 6, 8, 'primary', 180, { cue: 'Brace hard, drive the floor away' }),
          ex('barbell-row', 'Barbell bent-over row', 'back', 2, 6, 8, 'volume', 120, { cue: 'Chest to bar, squeeze at top' }),
          ex('lat-pulldown', 'Lat pulldown (wide grip)', 'back', 2, 6, 8, 'volume', 90, { cue: 'Pull elbows to hips' }),
          ex('seated-row', 'Seated cable row', 'back', 2, 6, 8, 'volume', 90, { cue: 'Full stretch, controlled pull' }),
          ex('face-pull', 'Cable face pull', 'shoulders', 2, 6, 8, 'health', 60, { cue: 'Rear delt + rotator cuff' }),
          ex('barbell-curl', 'Barbell curl', 'biceps', 2, 6, 8, 'isolation', 75, { cue: 'Strict, no swinging' }),
          ex('hammer-curl', 'Hammer curl', 'biceps', 2, 6, 8, 'isolation', 60, { cue: 'Brachialis builder' }),
        ],
      },
      {
        id: 'legs',
        name: 'Legs',
        schedule: 'Thu',
        focus: 'Quads · Hamstrings · Glutes · Calves',
        patron: 'Atlas',
        exercises: [
          ex('back-squat', 'Back squat', 'quads', 2, 6, 8, 'primary', 180, { cue: 'Below parallel, chest up' }),
          ex('rdl', 'Romanian deadlift', 'hamstrings', 2, 6, 8, 'volume', 120, { cue: 'Hinge at hips, hamstring stretch' }),
          ex('leg-press', 'Leg press (high foot)', 'glutes', 2, 6, 8, 'volume', 120, { cue: 'Full range' }),
          ex('leg-curl', 'Leg curl (lying or seated)', 'hamstrings', 2, 6, 8, 'isolation', 90, { cue: '3-second eccentric' }),
          ex('leg-extension', 'Leg extension', 'quads', 2, 6, 8, 'isolation', 60, { cue: 'Pause at the top' }),
          ex('walking-lunge', 'Walking dumbbell lunge', 'glutes', 2, 6, 8, 'volume', 90, { perSide: true }),
          ex('standing-calf', 'Standing calf raise', 'calves', 2, 6, 8, 'isolation', 60, { cue: 'Full stretch at the bottom' }),
        ],
      },
      {
        id: 'full',
        name: 'Full body',
        schedule: 'Sat',
        focus: 'Strength + volume',
        patron: 'Olympus',
        exercises: [
          ex('heavy-choice', 'Heavy squat or bench (pick 1)', 'quads', 2, 6, 8, 'strength', 180, { cue: 'Max strength, no grind reps' }),
          ex('weighted-pullup', 'Weighted pull-up or chin-up', 'back', 2, 6, 8, 'volume', 120, { cue: 'Add weight if bodyweight is easy' }),
          ex('db-shoulder-press', 'Dumbbell shoulder press', 'shoulders', 2, 6, 8, 'volume', 90, { cue: 'Full ROM, seated or standing' }),
          ex('bulgarian-split', 'Bulgarian split squat', 'quads', 2, 6, 8, 'volume', 90, { cue: 'Rear foot elevated, glute drive', perSide: true }),
          ex('tbar-row', 'T-bar or chest-supported row', 'back', 2, 6, 8, 'volume', 90, { cue: 'Mid-back thickness' }),
          ex('plank', 'Plank', 'core', 2, 45, 60, 'core', 60, { cue: 'Add a plate when it gets easy', unit: 'sec' }),
          ex('ab-wheel', 'Ab wheel rollout', 'core', 2, 6, 8, 'core', 60, { cue: 'Do not let the hips sag' }),
        ],
      },
    ],
  },

  'block-b': {
    id: 'block-b',
    name: 'Block B — variation',
    note: 'Same four days, same muscles, different lifts',
    days: [
      {
        id: 'push',
        name: 'Push',
        schedule: 'Mon',
        focus: 'Chest · Shoulders · Triceps',
        patron: 'Zeus',
        exercises: [
          ex('incline-bb-press', 'Incline barbell press', 'chest', 2, 6, 8, 'primary', 150, { cue: 'Upper chest bias' }),
          ex('flat-db-press', 'Flat dumbbell press', 'chest', 2, 6, 8, 'volume', 90, { cue: 'Deeper stretch than the bar' }),
          ex('seated-db-ohp', 'Seated dumbbell shoulder press', 'shoulders', 2, 6, 8, 'primary', 120),
          ex('machine-lateral', 'Machine lateral raise', 'shoulders', 2, 6, 8, 'isolation', 60, { cue: 'Constant tension, no swing' }),
          ex('close-grip-bench', 'Close-grip bench press', 'triceps', 2, 6, 8, 'volume', 90, { cue: 'Shoulder-width grip' }),
          ex('skullcrusher', 'EZ-bar skullcrusher', 'triceps', 2, 6, 8, 'isolation', 60, { cue: 'Bar behind the head' }),
          ex('cable-crossover', 'Low-to-high cable crossover', 'chest', 2, 6, 8, 'finisher', 60, { cue: 'Pump finisher' }),
        ],
      },
      {
        id: 'pull',
        name: 'Pull',
        schedule: 'Tue',
        focus: 'Back · Biceps · Rear delts',
        patron: 'Herakles',
        exercises: [
          ex('trap-bar-deadlift', 'Trap-bar deadlift or rack pull', 'back', 2, 6, 8, 'primary', 180, { cue: 'Easier on the lower back than the bar' }),
          ex('weighted-pullup', 'Weighted pull-up', 'back', 2, 6, 8, 'primary', 150, { cue: 'Full hang each rep' }),
          ex('chest-supported-row', 'Chest-supported row', 'back', 2, 6, 8, 'volume', 90, { cue: 'No body english' }),
          ex('single-arm-row', 'Single-arm dumbbell row', 'back', 2, 6, 8, 'volume', 90, { cue: 'Drive the elbow past the ribs', perSide: true }),
          ex('reverse-pec-deck', 'Reverse pec deck', 'shoulders', 2, 6, 8, 'health', 60, { cue: 'Rear delts' }),
          ex('incline-db-curl', 'Incline dumbbell curl', 'biceps', 2, 6, 8, 'isolation', 75, { cue: 'Long-head stretch' }),
          ex('rope-hammer-curl', 'Cable rope hammer curl', 'biceps', 2, 6, 8, 'isolation', 60),
        ],
      },
      {
        id: 'legs',
        name: 'Legs',
        schedule: 'Thu',
        focus: 'Quads · Hamstrings · Glutes · Calves',
        patron: 'Atlas',
        exercises: [
          ex('front-squat', 'Front squat', 'quads', 2, 6, 8, 'primary', 180, { cue: 'Upright torso, elbows high' }),
          ex('stiff-leg-deadlift', 'Stiff-leg deadlift', 'hamstrings', 2, 6, 8, 'volume', 120, { cue: 'Straighter knees than an RDL' }),
          ex('hack-squat', 'Hack squat', 'quads', 2, 6, 8, 'volume', 120, { cue: 'Full depth, controlled' }),
          ex('bulgarian-split', 'Bulgarian split squat', 'glutes', 2, 6, 8, 'volume', 90, { cue: 'Rear foot elevated, glute drive', perSide: true }),
          ex('nordic-curl', 'Nordic curl or lying leg curl', 'hamstrings', 2, 6, 8, 'isolation', 90, { cue: 'Fight the lowering' }),
          ex('seated-calf', 'Seated calf raise', 'calves', 2, 6, 8, 'isolation', 60, { cue: 'Soleus — the standing raise misses it' }),
          ex('hanging-leg-raise', 'Hanging leg raise', 'core', 2, 6, 8, 'core', 60, { cue: 'No swinging' }),
        ],
      },
      {
        id: 'full',
        name: 'Full body',
        schedule: 'Sat',
        focus: 'Strength + volume',
        patron: 'Olympus',
        exercises: [
          ex('heavy-choice-b', 'Heavy deadlift or overhead press (pick 1)', 'back', 2, 6, 8, 'strength', 180, { cue: 'Max strength, no grind reps' }),
          ex('dips', 'Weighted dips', 'chest', 2, 6, 8, 'volume', 120, { cue: 'Lean forward for chest' }),
          ex('chin-up', 'Chin-up', 'back', 2, 6, 8, 'volume', 120, { cue: 'Supinated grip, biceps get a share' }),
          ex('hip-thrust', 'Barbell hip thrust', 'glutes', 2, 6, 8, 'volume', 120, { cue: 'Pause at lockout' }),
          ex('seated-row', 'Seated cable row', 'back', 2, 6, 8, 'volume', 90),
          ex('goblet-squat', 'Goblet squat', 'quads', 2, 6, 8, 'volume', 90),
          ex('cable-crunch', 'Cable crunch', 'core', 2, 6, 8, 'core', 60, { cue: 'Round the spine, do not hip-hinge' }),
        ],
      },
    ],
  },
};

export const DEFAULT_PROGRAM_ID = 'block-a';

export function getProgram(id) {
  return PROGRAMS[id] || PROGRAMS[DEFAULT_PROGRAM_ID];
}

export function getDay(programId, dayId) {
  return getProgram(programId).days.find((d) => d.id === dayId) || null;
}

/** Planned weekly hard sets per muscle for a program. */
export function plannedWeeklyVolume(programId) {
  const out = {};
  for (const day of getProgram(programId).days) {
    for (const e of day.exercises) out[e.muscle] = (out[e.muscle] || 0) + e.sets;
  }
  return out;
}

/** How a prescription reads on screen: "3 × 10–12", "3 × 45–60 sec". */
export function prescription(e) {
  const [low, high] = e.repRange;
  const range = low === high ? `${low}` : `${low}–${high}`;
  const unit = e.unit === 'sec' ? ' sec' : '';
  const side = e.perSide ? ' each side' : '';
  return `${e.sets} × ${range}${unit}${side}`;
}
