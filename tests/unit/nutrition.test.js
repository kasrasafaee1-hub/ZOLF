import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bmrFromLbm,
  macroTargets,
  weeklyRate,
  bulkCheck,
  bodyFatBand,
  tdee,
  lbToKg,
  kgToLb,
} from '../../src/core/nutrition.js';

test('lb/kg conversions round-trip', () => {
  assert.ok(Math.abs(kgToLb(lbToKg(179.7)) - 179.7) < 1e-9);
});

test('BMR reproduces the InBody sheet (149.9 lb LBM -> 1840 kcal)', () => {
  // The sheet prints 1840; Katch-McArdle on the printed LBM lands within 1 kcal
  // of that, and on the derived LBM lands exactly.
  assert.ok(Math.abs(bmrFromLbm(149.9) - 1840) <= 1);
  const t = macroTargets({ weightLb: 179.7, bodyFatPct: 16.5 });
  assert.equal(t.bmr, 1840);
});

test('macro targets derive lean mass and fat mass from the sheet', () => {
  const t = macroTargets({ weightLb: 179.7, bodyFatPct: 16.5 });
  assert.equal(t.fatMass, 29.7); // sheet says 29.8 lb
  assert.equal(t.lbm, 150.0); // sheet says 149.9 lb
});

test('bulk adds a surplus, cut takes a deficit, maintain does neither', () => {
  const args = { weightLb: 179.7, bodyFatPct: 16.5, activityId: 'moderate' };
  const bulk = macroTargets({ ...args, phaseId: 'bulk' });
  const maint = macroTargets({ ...args, phaseId: 'maintain' });
  const cut = macroTargets({ ...args, phaseId: 'cut' });
  assert.equal(maint.calories, maint.maintenance);
  assert.ok(bulk.calories > maint.calories);
  assert.ok(cut.calories < maint.calories);
  assert.equal(cut.calories, Math.round(maint.maintenance * 0.8));
});

test('macros add back up to the calorie target within rounding', () => {
  const t = macroTargets({ weightLb: 179.7, bodyFatPct: 16.5, phaseId: 'bulk' });
  const fromMacros = t.protein * 4 + t.fat * 9 + t.carbs * 4;
  assert.ok(Math.abs(fromMacros - t.calories) <= 6, `${fromMacros} vs ${t.calories}`);
});

test('protein scales with lean mass, not scale weight', () => {
  const lean = macroTargets({ weightLb: 180, bodyFatPct: 10 });
  const fat = macroTargets({ weightLb: 180, bodyFatPct: 30 });
  assert.ok(lean.protein > fat.protein);
});

test('fat never drops below the 0.3 g/lb floor', () => {
  const t = macroTargets({ weightLb: 179.7, bodyFatPct: 16.5, phaseId: 'cut' });
  assert.ok(t.fat >= 0.3 * 179.7 - 1);
});

test('carbs never go negative for an extreme cut', () => {
  const t = macroTargets({ weightLb: 400, bodyFatPct: 5, phaseId: 'cut' });
  assert.ok(t.carbs >= 0);
});

test('activity multiplier raises maintenance', () => {
  assert.ok(tdee(1840, 'high') > tdee(1840, 'moderate'));
  assert.ok(tdee(1840, 'moderate') > tdee(1840, 'sedentary'));
  assert.equal(tdee(1840, 'nonsense'), tdee(1840, 'moderate'));
});

test('weeklyRate fits a slope through bodyweight noise', () => {
  const r = weeklyRate([
    { date: '2026-09-01', weight: 179.0 },
    { date: '2026-09-03', weight: 180.2 },
    { date: '2026-09-05', weight: 179.4 },
    { date: '2026-09-08', weight: 180.0 },
  ]);
  assert.ok(r > 0 && r < 2, `rate was ${r}`);
});

test('weeklyRate is exact on a clean linear series', () => {
  const r = weeklyRate([
    { date: '2026-09-01', weight: 180 },
    { date: '2026-09-08', weight: 181 },
    { date: '2026-09-15', weight: 182 },
  ]);
  assert.equal(r, 1);
});

test('weeklyRate needs two distinct days', () => {
  assert.equal(weeklyRate([]), null);
  assert.equal(weeklyRate([{ date: '2026-09-01', weight: 180 }]), null);
  assert.equal(
    weeklyRate([
      { date: '2026-09-01', weight: 180 },
      { date: '2026-09-01', weight: 181 },
    ]),
    null
  );
});

test('weeklyRate ignores junk entries', () => {
  const r = weeklyRate([
    { date: '2026-09-01', weight: 180 },
    { date: 'not-a-date', weight: 999 },
    { date: '2026-09-08', weight: 181 },
    { date: '2026-09-09', weight: null },
  ]);
  assert.equal(r, 1);
});

test('bulkCheck stops the bulk at the body-fat ceiling', () => {
  const r = bulkCheck({ rateLbPerWeek: 0.3, bodyFatPct: 21, ceilingPct: 20, phaseId: 'bulk' });
  assert.equal(r.status, 'stop');
  assert.match(r.messages.join(' '), /ceiling/);
});

test('bulkCheck warns on gaining too fast and too slow', () => {
  assert.equal(bulkCheck({ rateLbPerWeek: 1.5, bodyFatPct: 16.5, phaseId: 'bulk' }).status, 'warn');
  assert.equal(bulkCheck({ rateLbPerWeek: 0.0, bodyFatPct: 16.5, phaseId: 'bulk' }).status, 'warn');
  assert.equal(bulkCheck({ rateLbPerWeek: 0.35, bodyFatPct: 16.5, phaseId: 'bulk' }).status, 'ok');
});

test('bulkCheck judges cut rates on the other side of zero', () => {
  assert.equal(bulkCheck({ rateLbPerWeek: -1.0, bodyFatPct: 18, phaseId: 'cut' }).status, 'ok');
  assert.equal(bulkCheck({ rateLbPerWeek: -2.0, bodyFatPct: 18, phaseId: 'cut' }).status, 'warn');
  assert.equal(bulkCheck({ rateLbPerWeek: 0.2, bodyFatPct: 18, phaseId: 'cut' }).status, 'warn');
});

test('bulkCheck asks for data when there is no trend yet', () => {
  const r = bulkCheck({ rateLbPerWeek: null, bodyFatPct: 16.5, phaseId: 'bulk' });
  assert.match(r.messages.join(' '), /Log a few bodyweights/);
});

test('16.5% lands in the band worth bulking from', () => {
  assert.equal(bodyFatBand(16.5).band, 'fit');
  assert.equal(bodyFatBand(9).band, 'lean');
  assert.equal(bodyFatBand(28).band, 'high');
  assert.equal(bodyFatBand(NaN), null);
});
