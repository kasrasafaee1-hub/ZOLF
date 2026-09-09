import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch, expect, logSet, tab } from './harness.js';

let app;
let page;

before(async () => {
  app = await launch();
  page = app.page;
});
after(async () => app?.close());
beforeEach(async () => {
  await app.reset();
  await tab(page, 'settings');
});

test('program can be switched and the day picker follows', async () => {
  await page.locator('[data-select="program"]').selectOption('balanced-4day');
  await expect(page.getByText('Lower A / Upper Push')).toBeVisible();
  await tab(page, 'today');
  await expect(page.locator('[data-day="lower-a"]')).toContainText('Lower A');
  await expect(page.locator('[data-day="lower-b"]')).toContainText('Lower B');
});

test('switching program mid-workout asks before dropping the session', async () => {
  await tab(page, 'today');
  await page.locator('[data-day="legs-core"]').click();
  await logSet(page, 'back-squat', 0, 185, 8);
  await tab(page, 'settings');
  page.once('dialog', (d) => d.dismiss());
  await page.locator('[data-select="program"]').selectOption('balanced-4day');
  const programId = await page.evaluate(() => window.__zolf.store.state.settings.programId);
  assert.equal(programId, 'kasra-4day', 'declining the prompt keeps the program and the workout');
  await tab(page, 'today');
  await expect(page.locator('#topbar-right')).toContainText('IN PROGRESS');
});

test('activity level changes the calorie target', async () => {
  await tab(page, 'body');
  await page.locator('[data-metric="weight"]').fill('179.7');
  await page.locator('[data-metric="bodyFatPct"]').fill('16.5');
  await page.locator('[data-action="save-metric"]').click();
  const moderate = await page.locator('[data-targets]').textContent();
  await tab(page, 'settings');
  await page.locator('[data-select="activity"]').selectOption('high');
  await tab(page, 'body');
  const high = await page.locator('[data-targets]').textContent();
  assert.notEqual(moderate, high);
  await expect(page.locator('[data-targets]')).toContainText('3,400'); // round(1840 * 1.65) * 1.12
});

test('rest duration setting is applied to the timer', async () => {
  await page.locator('[data-select="rest"]').selectOption('60');
  await tab(page, 'today');
  await page.locator('[data-day="legs-core"]').click();
  await logSet(page, 'back-squat', 0, 185, 8);
  await expect(page.locator('#rest-time')).toHaveText(/^(1:00|0:5\d)$/);
});

test('body fat ceiling is configurable and drives the bulk warning', async () => {
  await page.locator('[data-input="ceiling"]').fill('17');
  await page.locator('[data-input="ceiling"]').blur();
  await tab(page, 'body');
  await page.locator('[data-metric="weight"]').fill('179.7');
  await page.locator('[data-metric="bodyFatPct"]').fill('17.5');
  await page.locator('[data-action="save-metric"]').click();
  await expect(page.locator('[data-banner="phase"]')).toContainText('17% ceiling');
});

test('settings persist across a reload', async () => {
  await page.locator('[data-select="program"]').selectOption('balanced-4day');
  await page.locator('[data-select="rest"]').selectOption('180');
  await page.reload();
  await tab(page, 'settings');
  await expect(page.locator('[data-select="program"]')).toHaveValue('balanced-4day');
  await expect(page.locator('[data-select="rest"]')).toHaveValue('180');
});

test('export produces a downloadable backup of the log', async () => {
  await tab(page, 'today');
  await page.locator('[data-day="legs-core"]').click();
  await logSet(page, 'back-squat', 0, 185, 8);
  await page.locator('[data-action="finish"]').click();
  await tab(page, 'settings');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-action="export"]').click(),
  ]);
  assert.match(download.suggestedFilename(), /^zolf-lift-\d{4}-\d{2}-\d{2}\.json$/);
  const stream = await download.createReadStream();
  const text = await new Promise((res, rej) => {
    let buf = '';
    stream.on('data', (c) => (buf += c));
    stream.on('end', () => res(buf));
    stream.on('error', rej);
  });
  const parsed = JSON.parse(text);
  assert.equal(parsed.sessions.length, 1);
  assert.equal(parsed.sessions[0].entries[0].sets[0].weight, '185');
});

test('a backup can be imported back in', async () => {
  const backup = JSON.stringify({
    version: 1,
    settings: { programId: 'kasra-4day', activityId: 'moderate', phaseId: 'bulk', restSeconds: 150, bodyFatCeiling: 20 },
    sessions: [
      {
        id: 'imported',
        dayId: 'legs-core',
        dayName: 'Legs, Abs & Core',
        date: '2026-08-01',
        entries: [{ exerciseId: 'back-squat', name: 'Back Squat', muscle: 'quads', sets: [{ weight: 315, reps: 5, done: true }] }],
      },
    ],
    metrics: [],
    bodyweights: [],
    active: null,
  });
  await page.locator('[data-input="import"]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  });
  await expect(page.locator('#toast')).toContainText('Imported');
  await tab(page, 'history');
  await expect(page.locator('[data-session]')).toContainText('315×5');
});

test('importing a non-backup file is rejected without losing data', async () => {
  await page.locator('[data-input="import"]').setInputFiles({
    name: 'random.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":"world"}'),
  });
  await expect(page.locator('#toast')).toContainText('not a valid backup');
});

test('erase wipes everything after confirmation', async () => {
  await tab(page, 'today');
  await page.locator('[data-day="legs-core"]').click();
  await logSet(page, 'back-squat', 0, 185, 8);
  await page.locator('[data-action="finish"]').click();
  await tab(page, 'settings');
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-action="reset"]').click();
  await expect(page.locator('#topbar-right')).toContainText('0 sessions');
  assert.deepEqual(app.errors, []);
});
