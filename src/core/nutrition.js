// Body-composition math and calorie/macro targets.
// All internal math is metric; callers pass/receive pounds.

export const LB_PER_KG = 2.2046226218;

export const lbToKg = (lb) => lb / LB_PER_KG;
export const kgToLb = (kg) => kg * LB_PER_KG;

/**
 * Katch-McArdle BMR from lean body mass. This is the formula InBody uses,
 * so it reproduces the number printed on the sheet.
 */
export function bmrFromLbm(lbmLb) {
  return Math.round(370 + 21.6 * lbToKg(lbmLb));
}

export const ACTIVITY = {
  sedentary: { id: 'sedentary', label: 'Desk job, no steps', factor: 1.25 },
  light: { id: 'light', label: 'Light (3 lifts/wk)', factor: 1.4 },
  moderate: { id: 'moderate', label: 'Moderate (4 lifts/wk)', factor: 1.5 },
  high: { id: 'high', label: 'High (4 lifts + cardio/active job)', factor: 1.65 },
};

export const PHASES = {
  bulk: { id: 'bulk', label: 'Lean bulk', surplusPct: 0.12 },
  maintain: { id: 'maintain', label: 'Maintain', surplusPct: 0 },
  cut: { id: 'cut', label: 'Cut', surplusPct: -0.2 },
};

export function tdee(bmr, activityId) {
  const a = ACTIVITY[activityId] || ACTIVITY.moderate;
  return Math.round(bmr * a.factor);
}

/**
 * Macro targets.
 * Protein: 1.1 g per lb of LEAN mass (scales correctly at any body fat level).
 * Fat: 25% of calories, floored at 0.3 g/lb bodyweight for hormonal health.
 * Carbs: whatever is left.
 */
export function macroTargets({ weightLb, bodyFatPct, activityId = 'moderate', phaseId = 'bulk' }) {
  const fatMass = weightLb * (bodyFatPct / 100);
  const lbm = weightLb - fatMass;
  const bmr = bmrFromLbm(lbm);
  const maintenance = tdee(bmr, activityId);
  const phase = PHASES[phaseId] || PHASES.bulk;
  const calories = Math.round(maintenance * (1 + phase.surplusPct));

  const protein = Math.round(1.1 * lbm);
  const fatFromPct = (calories * 0.25) / 9;
  const fatFloor = 0.3 * weightLb;
  const fat = Math.round(Math.max(fatFromPct, fatFloor));
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  return { lbm: round1(lbm), fatMass: round1(fatMass), bmr, maintenance, calories, protein, fat, carbs, phase: phase.id };
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Weekly rate of weight change from a series of bodyweight entries,
 * using a least-squares fit so day-to-day water noise does not dominate.
 * @param {{date:string, weight:number}[]} entries
 * @returns {number|null} pounds per week, or null if under 2 distinct days
 */
export function weeklyRate(entries) {
  const pts = (entries || [])
    .filter((e) => Number.isFinite(e.weight) && e.date)
    .map((e) => ({ t: Date.parse(e.date) / 86400000, w: e.weight }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;
  const spanDays = pts[pts.length - 1].t - pts[0].t;
  if (spanDays <= 0) return null;

  const n = pts.length;
  const mt = pts.reduce((s, p) => s + p.t, 0) / n;
  const mw = pts.reduce((s, p) => s + p.w, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.t - mt) * (p.w - mw);
    den += (p.t - mt) ** 2;
  }
  if (den === 0) return null;
  return round2((num / den) * 7);
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Bulking guardrail. A lean bulk should run 0.25-0.5 lb/wk; faster than that is
 * mostly fat, and past the body-fat ceiling the surplus stops being worth it.
 */
export function bulkCheck({ rateLbPerWeek, bodyFatPct, ceilingPct = 20, phaseId = 'bulk' }) {
  const msgs = [];
  let status = 'ok';

  if (phaseId === 'bulk') {
    if (Number.isFinite(bodyFatPct) && bodyFatPct >= ceilingPct) {
      status = 'stop';
      msgs.push(`Body fat is ${bodyFatPct}% — at or past your ${ceilingPct}% ceiling. Switch to a cut.`);
    }
    if (rateLbPerWeek != null) {
      if (rateLbPerWeek > 0.75) {
        if (status !== 'stop') status = 'warn';
        msgs.push(`Gaining ${rateLbPerWeek} lb/wk — too fast. Cut 200-300 kcal.`);
      } else if (rateLbPerWeek < 0.1) {
        if (status !== 'stop') status = 'warn';
        msgs.push(`Gaining ${rateLbPerWeek} lb/wk — too slow to build. Add 150-250 kcal.`);
      } else {
        msgs.push(`Gaining ${rateLbPerWeek} lb/wk — right in the lean-bulk window.`);
      }
    }
  } else if (phaseId === 'cut') {
    if (rateLbPerWeek != null) {
      if (rateLbPerWeek > -0.1) {
        status = 'warn';
        msgs.push(`Losing ${(-rateLbPerWeek).toFixed(2)} lb/wk — not enough deficit.`);
      } else if (rateLbPerWeek < -1.5) {
        status = 'warn';
        msgs.push(`Losing ${(-rateLbPerWeek).toFixed(2)} lb/wk — fast enough to cost muscle. Add 200 kcal.`);
      } else {
        msgs.push(`Losing ${(-rateLbPerWeek).toFixed(2)} lb/wk — good rate.`);
      }
    }
  }

  if (!msgs.length) msgs.push('Log a few bodyweights to get a trend.');
  return { status, messages: msgs };
}

/** Where a given body fat % sits for a male. */
export function bodyFatBand(pct) {
  if (!Number.isFinite(pct)) return null;
  if (pct < 6) return { band: 'essential', label: 'Essential fat — not sustainable' };
  if (pct < 11) return { band: 'lean', label: 'Lean / stage-ready' };
  if (pct < 15) return { band: 'athletic', label: 'Athletic' };
  if (pct < 20) return { band: 'fit', label: 'Fit — good place to bulk from' };
  if (pct < 25) return { band: 'average', label: 'Average — cut before bulking further' };
  return { band: 'high', label: 'High — prioritise a cut' };
}
