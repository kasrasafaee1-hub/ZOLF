// Amore's split: Push (Tue) / Quads (Wed) / Pull (Thu) / Glutes & Hams (Fri).
//
// Standard hypertrophy prescription — 3 working sets, rep ranges chosen per
// exercise rather than one number across the board. Block B keeps the same
// four days and muscle groups with different lifts, for rotating.

const aEx = (id, name, muscle, sets, low, high, role, rest, opts = {}) => ({
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

export const AMORE_PROGRAMS = {
  'block-a': {
    id: 'block-a',
    name: 'Block A — current',
    note: 'Push Tue / Quads Wed / Pull Thu / Glutes Fri',
    days: [
      {
        id: 'push',
        name: 'Push',
        schedule: 'Tue',
        focus: 'Chest · Shoulders · Triceps',
        exercises: [
          aEx('db-bench', 'Dumbbell bench press', 'chest', 3, 8, 10, 'primary', 120, { cue: 'Full stretch at the bottom' }),
          aEx('incline-db-press', 'Incline dumbbell press', 'chest', 3, 10, 12, 'volume', 90, { cue: 'Upper chest' }),
          aEx('seated-db-ohp', 'Seated dumbbell shoulder press', 'shoulders', 3, 8, 10, 'primary', 90),
          aEx('cable-lateral', 'Cable lateral raise', 'shoulders', 3, 12, 15, 'isolation', 60, { cue: 'Lead with the elbow' }),
          aEx('cable-fly', 'Cable chest fly', 'chest', 3, 12, 15, 'volume', 60, { cue: 'Squeeze at the middle' }),
          aEx('rope-pushdown', 'Rope pushdown', 'triceps', 3, 12, 15, 'isolation', 60, { cue: 'Elbows pinned' }),
          aEx('overhead-ext', 'Overhead cable extension', 'triceps', 3, 12, 15, 'isolation', 60, { cue: 'Long head stretch' }),
        ],
      },
      {
        id: 'quads',
        name: 'Quads',
        schedule: 'Wed',
        focus: 'Quads · Calves · Core',
        exercises: [
          aEx('back-squat', 'Back squat', 'quads', 3, 6, 8, 'primary', 180, { cue: 'Below parallel, chest up' }),
          aEx('leg-press', 'Leg press (feet low and narrow)', 'quads', 3, 10, 12, 'volume', 120, { cue: 'Quad bias, full range' }),
          aEx('bulgarian-split', 'Bulgarian split squat', 'quads', 3, 10, 12, 'volume', 90, { cue: 'Upright torso', perSide: true }),
          aEx('leg-extension', 'Leg extension', 'quads', 3, 12, 15, 'isolation', 60, { cue: 'Pause at the top' }),
          aEx('walking-lunge', 'Walking dumbbell lunge', 'glutes', 3, 12, 12, 'volume', 90, { perSide: true }),
          aEx('standing-calf', 'Standing calf raise', 'calves', 4, 12, 15, 'isolation', 60, { cue: 'Full stretch at the bottom' }),
          aEx('hanging-knee-raise', 'Hanging knee raise', 'core', 3, 12, 15, 'core', 60, { cue: 'No swinging' }),
        ],
      },
      {
        id: 'pull',
        name: 'Pull',
        schedule: 'Thu',
        focus: 'Back · Biceps · Rear delts',
        exercises: [
          aEx('lat-pulldown', 'Lat pulldown', 'back', 3, 8, 10, 'primary', 120, { cue: 'Pull elbows to hips' }),
          aEx('chest-supported-row', 'Chest-supported row', 'back', 3, 10, 12, 'volume', 90, { cue: 'No body english' }),
          aEx('seated-row', 'Seated cable row', 'back', 3, 10, 12, 'volume', 90, { cue: 'Full stretch, controlled pull' }),
          aEx('single-arm-row', 'Single-arm dumbbell row', 'back', 3, 10, 12, 'volume', 90, { cue: 'Drive the elbow past the ribs', perSide: true }),
          aEx('reverse-pec-deck', 'Reverse pec deck', 'shoulders', 3, 15, 15, 'health', 60, { cue: 'Rear delts and posture' }),
          aEx('incline-db-curl', 'Incline dumbbell curl', 'biceps', 3, 10, 12, 'isolation', 60, { cue: 'Long-head stretch' }),
          aEx('hammer-curl', 'Cable hammer curl', 'biceps', 3, 12, 15, 'isolation', 60),
        ],
      },
      {
        id: 'glutes',
        name: 'Glutes & Hamstrings',
        schedule: 'Fri',
        focus: 'Glutes · Hamstrings',
        exercises: [
          aEx('hip-thrust', 'Barbell hip thrust', 'glutes', 4, 8, 10, 'primary', 120, { cue: 'Pause and squeeze at the top' }),
          aEx('rdl', 'Romanian deadlift', 'hamstrings', 3, 8, 10, 'primary', 120, { cue: 'Hinge at the hips, soft knees' }),
          aEx('cable-kickback', 'Cable kickback', 'glutes', 3, 12, 15, 'isolation', 60, { cue: 'Squeeze, do not swing', perSide: true }),
          aEx('seated-leg-curl', 'Seated leg curl', 'hamstrings', 3, 12, 15, 'isolation', 60, { cue: '3-second lowering' }),
          aEx('sumo-deadlift', 'Sumo deadlift', 'glutes', 3, 8, 10, 'volume', 120, { cue: 'Wide stance, knees out' }),
          aEx('hip-abduction', 'Hip abduction machine', 'glutes', 3, 15, 20, 'isolation', 60, { cue: 'Lean forward slightly' }),
          aEx('back-extension', 'Back extension', 'hamstrings', 3, 12, 15, 'volume', 60, { cue: 'Glutes and hamstrings, not lower back' }),
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
        schedule: 'Tue',
        focus: 'Chest · Shoulders · Triceps',
        exercises: [
          aEx('incline-bb-press', 'Incline barbell press', 'chest', 3, 8, 10, 'primary', 120, { cue: 'Upper chest bias' }),
          aEx('machine-chest-press', 'Machine chest press', 'chest', 3, 10, 12, 'volume', 90, { cue: 'Constant tension' }),
          aEx('arnold-press', 'Arnold press', 'shoulders', 3, 10, 12, 'primary', 90, { cue: 'Rotate through the whole range' }),
          aEx('machine-lateral', 'Machine lateral raise', 'shoulders', 3, 12, 15, 'isolation', 60, { cue: 'No swing' }),
          aEx('pec-deck', 'Pec deck', 'chest', 3, 12, 15, 'volume', 60, { cue: 'Hold the squeeze' }),
          aEx('skullcrusher', 'EZ-bar skullcrusher', 'triceps', 3, 10, 12, 'isolation', 60, { cue: 'Bar behind the head' }),
          aEx('bench-dip', 'Bench dip', 'triceps', 3, 12, 15, 'isolation', 60, { cue: 'Elbows back, not flared' }),
        ],
      },
      {
        id: 'quads',
        name: 'Quads',
        schedule: 'Wed',
        focus: 'Quads · Calves · Core',
        exercises: [
          aEx('hack-squat', 'Hack squat', 'quads', 3, 8, 10, 'primary', 180, { cue: 'Full depth, controlled' }),
          aEx('front-squat', 'Goblet or front squat', 'quads', 3, 10, 12, 'volume', 120, { cue: 'Elbows high, torso upright' }),
          aEx('step-up', 'Dumbbell step-up', 'quads', 3, 10, 12, 'volume', 90, { cue: 'Drive through the front heel', perSide: true }),
          aEx('sissy-squat', 'Sissy squat', 'quads', 3, 12, 15, 'isolation', 60, { cue: 'Knees travel forward' }),
          aEx('reverse-lunge', 'Reverse lunge', 'glutes', 3, 12, 12, 'volume', 90, { perSide: true }),
          aEx('seated-calf', 'Seated calf raise', 'calves', 4, 12, 15, 'isolation', 60, { cue: 'Soleus — the standing raise misses it' }),
          aEx('cable-crunch', 'Cable crunch', 'core', 3, 15, 15, 'core', 60, { cue: 'Round the spine, do not hip-hinge' }),
        ],
      },
      {
        id: 'pull',
        name: 'Pull',
        schedule: 'Thu',
        focus: 'Back · Biceps · Rear delts',
        exercises: [
          aEx('assisted-pullup', 'Assisted pull-up', 'back', 3, 6, 10, 'primary', 120, { cue: 'Full hang each rep' }),
          aEx('t-bar-row', 'T-bar row', 'back', 3, 10, 12, 'volume', 90, { cue: 'Mid-back thickness' }),
          aEx('straight-arm-pulldown', 'Straight-arm pulldown', 'back', 3, 12, 15, 'volume', 60, { cue: 'Lats, arms stay straight' }),
          aEx('neutral-grip-pulldown', 'Neutral-grip pulldown', 'back', 3, 10, 12, 'volume', 90),
          aEx('face-pull', 'Cable face pull', 'shoulders', 3, 15, 15, 'health', 60, { cue: 'Rear delt and rotator cuff' }),
          aEx('preacher-curl', 'Preacher curl', 'biceps', 3, 10, 12, 'isolation', 60, { cue: 'No bouncing off the bottom' }),
          aEx('reverse-curl', 'Reverse curl', 'biceps', 3, 12, 15, 'isolation', 60, { cue: 'Forearms and brachialis' }),
        ],
      },
      {
        id: 'glutes',
        name: 'Glutes & Hamstrings',
        schedule: 'Fri',
        focus: 'Glutes · Hamstrings',
        exercises: [
          aEx('single-leg-hip-thrust', 'Single-leg hip thrust', 'glutes', 4, 10, 12, 'primary', 120, { cue: 'Ribs down, squeeze at the top', perSide: true }),
          aEx('stiff-leg-deadlift', 'Stiff-leg deadlift', 'hamstrings', 3, 8, 10, 'primary', 120, { cue: 'Straighter knees than an RDL' }),
          aEx('nordic-curl', 'Nordic curl', 'hamstrings', 3, 6, 10, 'isolation', 90, { cue: 'Fight the lowering' }),
          aEx('cable-pull-through', 'Cable pull-through', 'glutes', 3, 12, 15, 'volume', 60, { cue: 'Hinge, then squeeze' }),
          aEx('curtsy-lunge', 'Curtsy lunge', 'glutes', 3, 12, 12, 'volume', 90, { cue: 'Glute medius', perSide: true }),
          aEx('frog-pump', 'Frog pump', 'glutes', 3, 15, 20, 'isolation', 60, { cue: 'Heels together, knees out' }),
          aEx('good-morning', 'Good morning', 'hamstrings', 3, 10, 12, 'volume', 90, { cue: 'Light — this is a hinge drill' }),
        ],
      },
    ],
  },
};
