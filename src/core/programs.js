// Program definitions.
//
// "kasra-4day" is the split the user asked for, verbatim.
// "balanced-4day" is the alternative that raises leg frequency to 2x/week and
// cuts the direct-arm triple-up, for when segmental lean analysis says legs are
// the lagging segment.

const ex = (id, name, muscle, sets, low, high, type = 'isolation') => ({
  id,
  name,
  muscle,
  sets,
  repRange: [low, high],
  type,
});

export const MUSCLES = [
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'core',
];

export const PROGRAMS = {
  'kasra-4day': {
    id: 'kasra-4day',
    name: 'My Split (4 day)',
    // Each day carries a patron whose domain matches the work: Atlas bears
    // load, Zeus presses, Herakles pulls, Ares takes the arms.
    note: 'Legs+Core / Back+Tri / Chest+Delts+Bi / Arms+Core',
    days: [
      {
        id: 'legs-core',
        name: 'Legs, Abs & Core',
        patron: 'Atlas',
        epithet: 'who bears the weight of the heavens',
        exercises: [
          ex('back-squat', 'Back Squat', 'quads', 4, 5, 8, 'compound'),
          ex('rdl', 'Romanian Deadlift', 'hamstrings', 3, 8, 10, 'compound'),
          ex('leg-press', 'Leg Press', 'quads', 3, 10, 15, 'compound'),
          ex('leg-curl', 'Seated Leg Curl', 'hamstrings', 3, 10, 15),
          ex('walking-lunge', 'Walking Lunge', 'glutes', 3, 10, 12, 'compound'),
          ex('standing-calf', 'Standing Calf Raise', 'calves', 4, 8, 12),
          ex('hanging-leg-raise', 'Hanging Leg Raise', 'core', 3, 10, 15),
          ex('cable-crunch', 'Cable Crunch', 'core', 3, 12, 15),
          ex('pallof-press', 'Pallof Press', 'core', 3, 10, 12),
        ],
      },
      {
        id: 'back-triceps',
        name: 'Back & Triceps',
        patron: 'Herakles',
        epithet: 'of the twelve labours',
        exercises: [
          ex('weighted-pullup', 'Weighted Pull-Up', 'back', 4, 5, 8, 'compound'),
          ex('barbell-row', 'Barbell Row', 'back', 4, 6, 10, 'compound'),
          ex('chest-supported-row', 'Chest-Supported Row', 'back', 3, 10, 12, 'compound'),
          ex('lat-pulldown', 'Lat Pulldown', 'back', 3, 10, 12, 'compound'),
          ex('straight-arm-pulldown', 'Straight-Arm Pulldown', 'back', 3, 12, 15),
          ex('face-pull', 'Face Pull', 'shoulders', 3, 15, 20),
          ex('close-grip-bench', 'Close-Grip Bench Press', 'triceps', 3, 8, 10, 'compound'),
          ex('overhead-ext', 'Overhead Cable Extension', 'triceps', 3, 10, 12),
          ex('tricep-pushdown', 'Rope Pushdown', 'triceps', 3, 12, 15),
        ],
      },
      {
        id: 'chest-delts-biceps',
        name: 'Chest, Shoulders & Biceps',
        patron: 'Zeus',
        epithet: 'who hurls the thunderbolt',
        exercises: [
          ex('bench-press', 'Barbell Bench Press', 'chest', 4, 5, 8, 'compound'),
          ex('incline-db-press', 'Incline Dumbbell Press', 'chest', 3, 8, 12, 'compound'),
          ex('cable-fly', 'Cable Fly', 'chest', 3, 12, 15),
          ex('ohp', 'Standing Overhead Press', 'shoulders', 3, 6, 8, 'compound'),
          ex('db-lateral', 'Dumbbell Lateral Raise', 'shoulders', 4, 12, 15),
          ex('rear-delt-fly', 'Rear Delt Fly', 'shoulders', 3, 15, 20),
          ex('incline-db-curl', 'Incline Dumbbell Curl', 'biceps', 3, 10, 12),
          ex('hammer-curl', 'Hammer Curl', 'biceps', 3, 10, 12),
        ],
      },
      {
        id: 'arms-core',
        name: 'Arms & Abs',
        patron: 'Ares',
        epithet: 'lord of war',
        exercises: [
          ex('ez-bar-curl', 'EZ-Bar Curl', 'biceps', 4, 8, 12),
          ex('preacher-curl', 'Preacher Curl', 'biceps', 3, 10, 12),
          ex('cable-curl', 'Cable Curl', 'biceps', 3, 12, 15),
          ex('dips', 'Weighted Dips', 'triceps', 4, 8, 12, 'compound'),
          ex('skullcrusher', 'Skullcrusher', 'triceps', 3, 10, 12),
          ex('rope-pushdown-2', 'Rope Pushdown', 'triceps', 3, 12, 15),
          ex('reverse-curl', 'Reverse Curl', 'biceps', 3, 12, 15),
          ex('ab-wheel', 'Ab Wheel Rollout', 'core', 3, 8, 12),
          ex('weighted-decline-situp', 'Weighted Decline Sit-Up', 'core', 3, 12, 15),
        ],
      },
    ],
  },

  'balanced-4day': {
    id: 'balanced-4day',
    name: 'Balanced 4 day (legs 2x)',
    note: 'Lower A / Upper Push / Lower B / Upper Pull — for lagging legs',
    days: [
      {
        id: 'lower-a',
        name: 'Lower A (quad focus)',
        patron: 'Atlas',
        epithet: 'who bears the weight of the heavens',
        exercises: [
          ex('back-squat', 'Back Squat', 'quads', 4, 5, 8, 'compound'),
          ex('leg-press', 'Leg Press', 'quads', 3, 10, 15, 'compound'),
          ex('bulgarian-split', 'Bulgarian Split Squat', 'quads', 3, 8, 12, 'compound'),
          ex('leg-curl', 'Seated Leg Curl', 'hamstrings', 3, 10, 15),
          ex('standing-calf', 'Standing Calf Raise', 'calves', 4, 8, 12),
          ex('hanging-leg-raise', 'Hanging Leg Raise', 'core', 3, 10, 15),
          ex('pallof-press', 'Pallof Press', 'core', 3, 10, 12),
        ],
      },
      {
        id: 'upper-push',
        name: 'Upper Push',
        patron: 'Zeus',
        epithet: 'who hurls the thunderbolt',
        exercises: [
          ex('bench-press', 'Barbell Bench Press', 'chest', 4, 5, 8, 'compound'),
          ex('ohp', 'Standing Overhead Press', 'shoulders', 3, 6, 8, 'compound'),
          ex('incline-db-press', 'Incline Dumbbell Press', 'chest', 3, 8, 12, 'compound'),
          ex('cable-fly', 'Cable Fly', 'chest', 3, 12, 15),
          ex('db-lateral', 'Dumbbell Lateral Raise', 'shoulders', 4, 12, 15),
          ex('overhead-ext', 'Overhead Cable Extension', 'triceps', 3, 10, 12),
          ex('tricep-pushdown', 'Rope Pushdown', 'triceps', 3, 12, 15),
        ],
      },
      {
        id: 'lower-b',
        name: 'Lower B (posterior focus)',
        patron: 'Poseidon',
        epithet: 'shaker of the earth',
        exercises: [
          ex('rdl', 'Romanian Deadlift', 'hamstrings', 4, 6, 10, 'compound'),
          ex('hip-thrust', 'Hip Thrust', 'glutes', 3, 8, 12, 'compound'),
          ex('walking-lunge', 'Walking Lunge', 'glutes', 3, 10, 12, 'compound'),
          ex('leg-extension', 'Leg Extension', 'quads', 3, 12, 15),
          ex('seated-calf', 'Seated Calf Raise', 'calves', 4, 10, 15),
          ex('ab-wheel', 'Ab Wheel Rollout', 'core', 3, 8, 12),
          ex('cable-crunch', 'Cable Crunch', 'core', 3, 12, 15),
        ],
      },
      {
        id: 'upper-pull',
        name: 'Upper Pull',
        patron: 'Herakles',
        epithet: 'of the twelve labours',
        exercises: [
          ex('weighted-pullup', 'Weighted Pull-Up', 'back', 4, 5, 8, 'compound'),
          ex('barbell-row', 'Barbell Row', 'back', 4, 6, 10, 'compound'),
          ex('chest-supported-row', 'Chest-Supported Row', 'back', 3, 10, 12, 'compound'),
          ex('lat-pulldown', 'Lat Pulldown', 'back', 3, 10, 12, 'compound'),
          ex('face-pull', 'Face Pull', 'shoulders', 3, 15, 20),
          ex('rear-delt-fly', 'Rear Delt Fly', 'shoulders', 3, 15, 20),
          ex('incline-db-curl', 'Incline Dumbbell Curl', 'biceps', 3, 10, 12),
          ex('hammer-curl', 'Hammer Curl', 'biceps', 3, 10, 12),
        ],
      },
    ],
  },
};

export const DEFAULT_PROGRAM_ID = 'kasra-4day';

export function getProgram(id) {
  return PROGRAMS[id] || PROGRAMS[DEFAULT_PROGRAM_ID];
}

export function getDay(programId, dayId) {
  const p = getProgram(programId);
  return p.days.find((d) => d.id === dayId) || null;
}

/** Planned weekly hard sets per muscle for a program. */
export function plannedWeeklyVolume(programId) {
  const p = getProgram(programId);
  const out = {};
  for (const day of p.days) {
    for (const e of day.exercises) {
      out[e.muscle] = (out[e.muscle] || 0) + e.sets;
    }
  }
  return out;
}
