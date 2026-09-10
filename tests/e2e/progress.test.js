import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch, expect, tab } from './harness.js';

let app;
let page;

/** Seeds finished sessions straight into the store, bypassing the UI. */
const seed = (page, sessions) =>
  page.evaluate((rows) => {
    const s = window.__zolf.store;
    s.update((state) => ({
      ...state,
      sessions: rows.map((r, i) => ({
        id: 'seed' + i,
        dayId: r.dayId,
        dayName: r.dayName,
        date: r.date,
        entries: r.entries,
      })),
    }));
    window.__zolf.render();
  }, sessions);

const squatSession = (date, weight) => ({
  dayId: 'legs',
  dayName: 'Legs',
  date,
  entries: [
    {
      exerciseId: 'back-squat',
      name: 'Back Squat',
      muscle: 'quads',
      sets: [
        { weight, reps: 5, done: true },
        { weight, reps: 5, done: true },
        { weight, reps: 5, done: true },
      ],
    },
  ],
});

before(async () => {
  app = await launch();
  page = app.page;
});
after(async () => app?.close());
beforeEach(async () => {
  await app.reset();
  await tab(page, 'progress');
});

test('with no history it defaults to the program plan', async () => {
  await expect(page.getByRole('heading', { name: 'Weekly volume' })).toBeVisible();
  await expect(page.locator('[data-volume-mode="planned"]')).toHaveClass(/on/);
  await expect(page.getByText(/your program prescribes/)).toBeVisible();
  await expect(page.locator('[data-volume]')).toBeVisible();
  await expect(page.getByText('No lifts logged yet')).toBeVisible();
});

test('the volume audit calls out what the programme under-trains', async () => {
  await expect(page.locator('[data-muscle="calves"]')).toContainText('LOW');
  await expect(page.locator('[data-muscle="calves"]')).toContainText('below 6');
  for (const m of ['chest', 'back', 'quads', 'hamstrings']) {
    await expect(page.locator(`[data-muscle="${m}"]`)).toContainText('IN RANGE');
  }
});

test('the variation block trains the same muscles to the same standard', async () => {
  await tab(page, 'settings');
  await page.locator('[data-select="program"]').selectOption('block-b');
  await tab(page, 'progress');
  for (const m of ['quads', 'hamstrings', 'glutes', 'chest', 'back', 'biceps', 'triceps']) {
    await expect(page.locator(`[data-muscle="${m}"]`)).toContainText('IN RANGE');
  }
});

test('the actual-volume view reports the sets that were really completed', async () => {
  const iso = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
  await seed(page, [squatSession(iso(1), 185)]);
  await page.locator('[data-volume-mode="actual"]').click();
  await expect(page.getByText(/last 7 days \(1 session\)/)).toBeVisible();
  await expect(page.locator('[data-muscle="quads"]')).toContainText('3 sets');
  await expect(page.locator('[data-muscle="chest"]')).toContainText('0 sets');
});

test('a full rotation inside the week defaults straight to actual volume', async () => {
  const iso = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
  await seed(page, [1, 2, 3, 4].map((d) => squatSession(iso(d), 185)));
  await page.reload();
  await tab(page, 'progress');
  await expect(page.locator('[data-volume-mode="actual"]')).toHaveClass(/on/);
});

test('the plan view can be reached again from the actual view', async () => {
  const iso = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
  await seed(page, [squatSession(iso(1), 185)]);
  await page.locator('[data-volume-mode="actual"]').click();
  await page.locator('[data-volume-mode="planned"]').click();
  await expect(page.getByText(/your program prescribes/)).toBeVisible();
  await expect(page.locator('[data-muscle="quads"]')).toContainText('14 sets');
});

test('strength chart plots estimated 1RM over time', async () => {
  await seed(page, [squatSession('2026-08-01', 185), squatSession('2026-08-08', 205), squatSession('2026-08-15', 225)]);
  await expect(page.locator('[data-chart="e1rm"]')).toBeVisible();
  await expect(page.locator('[data-chart="e1rm"] svg.chart')).toBeVisible();
  await expect(page.locator('[data-chart="e1rm"] .dot')).toHaveCount(3);
  // 225x5 -> 262.5, 185x5 -> 215.8
  await expect(page.locator('[data-chart="e1rm"]')).toContainText('+46.7 lb since');
});

test('PR tiles show the best set ever performed', async () => {
  await seed(page, [squatSession('2026-08-01', 185), squatSession('2026-08-08', 225), squatSession('2026-08-15', 205)]);
  const stats = page.locator('.stat');
  await expect(stats.filter({ hasText: 'PR weight' })).toContainText('225');
  await expect(stats.filter({ hasText: 'Est. 1RM' })).toContainText('262.5');
});

test('the exercise picker only lists lifts that were actually trained', async () => {
  await seed(page, [squatSession('2026-08-01', 185)]);
  const options = page.locator('[data-select="exercise"] option');
  await expect(options).toHaveCount(1);
  await expect(options).toHaveText('Back squat');
});

test('tonnage chart appears once there is more than one session', async () => {
  await seed(page, [squatSession('2026-08-01', 185)]);
  await expect(page.locator('[data-chart="tonnage"]')).toHaveCount(0);
  await seed(page, [squatSession('2026-08-01', 185), squatSession('2026-08-08', 205)]);
  await expect(page.locator('[data-chart="tonnage"]')).toBeVisible();
  assert.deepEqual(app.errors, []);
});
