// Who each build of the app is for.
//
// Everything that differs between people lives here: the wordmark, the sex the
// body-composition maths is calibrated for, and which set of programs is
// loaded. The rest of the app reads the active profile and is otherwise
// identical, so a new person is a new entry rather than a fork.

export const PROFILES = {
  zolf: {
    id: 'zolf',
    word: 'ZOLF',
    mark: 'LIFT',
    title: 'ZOLF Lift',
    sex: 'male',
    /** Where a lean bulk stops being worth the fat that comes with it. */
    bodyFatCeiling: 20,
    activityId: 'moderate',
    tabs: { today: 'Today', history: 'Log', progress: 'Trials', body: 'Temple', settings: 'Forge' },
  },
  amore: {
    id: 'amore',
    word: 'AMORE',
    mark: 'SPLITS',
    title: 'Amore’s Splits',
    sex: 'female',
    // Women carry more essential fat, so the same judgement sits ~8 points
    // higher. Bulking past this buys fat, not muscle.
    bodyFatCeiling: 28,
    activityId: 'moderate',
    tabs: { today: 'Today', history: 'Log', progress: 'Progress', body: 'Body', settings: 'Settings' },
  },
};

export const DEFAULT_PROFILE_ID = 'zolf';

export function getProfile(id) {
  return PROFILES[id] || PROFILES[DEFAULT_PROFILE_ID];
}
