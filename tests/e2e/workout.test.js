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
beforeEach(() => app.reset());

test('boots to the day picker with all four days of the split', async () => {
  await expect(page.getByRole('heading', { name: /Pick today/ })).toBeVisible();
  await expect(page.locator('[data-day]')).toHaveCount(4);
  await expect(page.locator('[data-day="legs"]')).toContainText('Legs');
  await expect(page.locator('[data-day="pull"]')).toContainText('Pull');
  await expect(page.locator('[data-day="push"]')).toContainText('Push');
  await expect(page.locator('[data-day="full"]')).toContainText('Full body');
});

test('the page loads without any console or runtime errors', async () => {
  await tab(page, 'progress');
  await tab(page, 'body');
  await tab(page, 'settings');
  await tab(page, 'history');
  assert.deepEqual(app.errors, []);
});

test('starting a day opens the first exercise ready to log', async () => {
  await page.locator('[data-day="legs"]').click();
  await expect(page.getByRole('heading', { name: 'Legs' })).toBeVisible();
  await expect(page.locator('[data-ex="back-squat"] .setrow')).toHaveCount(4);
  await expect(page.locator('#topbar-right')).toContainText('IN PROGRESS');
});

test('logging a set marks it complete and starts the rest timer', async () => {
  await page.locator('[data-day="legs"]').click();
  await logSet(page, 'back-squat', 0, 185, 8);
  await expect(page.locator('[data-ex="back-squat"] [data-set="0"] [data-field="done"]')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.locator('#rest-bar')).toBeVisible();
  await expect(page.locator('#rest-time')).toHaveText(/^\d:\d\d$/);
});

test('the rest timer can be extended and skipped', async () => {
  await page.locator('[data-day="legs"]').click();
  await logSet(page, 'back-squat', 0, 185, 8);
  const before = await page.locator('#rest-time').textContent();
  await page.locator('#rest-add').click();
  assert.notEqual(await page.locator('#rest-time').textContent(), before);
  await page.locator('#rest-skip').click();
  await expect(page.locator('#rest-bar')).toBeHidden();
});

test('ticking an empty set fills in the suggested target', async () => {
  await page.locator('[data-day="legs"]').click();
  const row = page.locator('[data-ex="back-squat"] [data-set="0"]');
  await row.locator('[data-field="done"]').click();
  await expect(row.locator('[data-field="reps"]')).toHaveValue('6');
});

test('an in-progress workout survives a reload', async () => {
  await page.locator('[data-day="legs"]').click();
  await logSet(page, 'back-squat', 0, 185, 8);
  await page.reload();
  await expect(page.locator('#topbar-right')).toContainText('IN PROGRESS');
  await expect(page.locator('[data-ex="back-squat"] [data-set="0"] [data-field="weight"]')).toHaveValue('185');
  await expect(page.locator('[data-ex="back-squat"] [data-set="0"] [data-field="done"]')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});

test('sets can be added and removed mid-workout', async () => {
  await page.locator('[data-day="legs"]').click();
  await page.locator('[data-ex="back-squat"] [data-action="add-set"]').click();
  await expect(page.locator('[data-ex="back-squat"] .setrow')).toHaveCount(5);
  await page.locator('[data-ex="back-squat"] [data-set="0"] [data-field="remove"]').click();
  await expect(page.locator('[data-ex="back-squat"] .setrow')).toHaveCount(4);
});

test('exercises collapse and expand', async () => {
  await page.locator('[data-day="legs"]').click();
  await expect(page.locator('[data-ex="back-squat"] .ex-body')).toBeVisible();
  await page.locator('[data-toggle="back-squat"]').click();
  await expect(page.locator('[data-ex="back-squat"] .ex-body')).toHaveCount(0);
  await page.locator('[data-toggle="rdl"]').click();
  await expect(page.locator('[data-ex="rdl"] .ex-body')).toBeVisible();
});

test('finishing a workout files it into history', async () => {
  await page.locator('[data-day="legs"]').click();
  await logSet(page, 'back-squat', 0, 185, 8);
  await logSet(page, 'back-squat', 1, 185, 8);
  await page.locator('[data-action="finish"]').click();

  await expect(page.getByRole('heading', { name: /Pick today/ })).toBeVisible();
  await expect(page.locator('#topbar-right')).toContainText('1 sessions');

  await tab(page, 'history');
  await expect(page.locator('[data-session]')).toHaveCount(1);
  await expect(page.locator('[data-session]')).toContainText('Back squat');
  await expect(page.locator('[data-session]')).toContainText('185×8');
  await expect(page.locator('[data-session]')).toContainText('2 sets');
});

test('an empty workout is discarded rather than saved blank', async () => {
  await page.locator('[data-day="legs"]').click();
  await page.locator('[data-action="finish"]').click();
  await expect(page.locator('#topbar-right')).toContainText('0 sessions');
  await expect(page.locator('#toast')).toContainText('discarded');
});

test('discarding confirms first and then drops the session', async () => {
  await page.locator('[data-day="legs"]').click();
  await logSet(page, 'back-squat', 0, 185, 8);
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-action="discard"]').click();
  await expect(page.getByRole('heading', { name: /Pick today/ })).toBeVisible();
  await expect(page.locator('#topbar-right')).toContainText('0 sessions');
});

test('the picker flags the next day in the rotation', async () => {
  await page.locator('[data-day="legs"]').click();
  await logSet(page, 'back-squat', 0, 185, 8);
  await page.locator('[data-action="finish"]').click();
  await expect(page.locator('[data-day="full"] .pill')).toHaveText('NEXT');
});

test('progression adds weight once every set hits the top of the range', async () => {
  await page.locator('[data-day="legs"]').click();
  for (let i = 0; i < 4; i++) await logSet(page, 'back-squat', i, 185, 8);
  await page.locator('[data-action="finish"]').click();

  await page.locator('[data-day="legs"]').click();
  const hint = page.locator('[data-ex="back-squat"] [data-hint]');
  await expect(hint).toContainText('Target 195 lb');
  await expect(hint).toContainText('add 10 lb');
  await expect(page.locator('[data-ex="back-squat"] .prev')).toContainText('185×8');
});

test('progression holds the weight when reps fall short', async () => {
  await page.locator('[data-day="legs"]').click();
  await logSet(page, 'back-squat', 0, 185, 6);
  await page.locator('[data-action="finish"]').click();
  await page.locator('[data-day="legs"]').click();
  await expect(page.locator('[data-ex="back-squat"] [data-hint]')).toContainText('Target 185 lb');
});

test('a new PR is announced when the workout is finished', async () => {
  await page.locator('[data-day="legs"]').click();
  await logSet(page, 'back-squat', 0, 185, 8);
  await page.locator('[data-action="finish"]').click();
  await expect(page.locator('#toast')).toContainText('new PR');
});

test('a session can be deleted from history', async () => {
  await page.locator('[data-day="legs"]').click();
  await logSet(page, 'back-squat', 0, 185, 8);
  await page.locator('[data-action="finish"]').click();
  await tab(page, 'history');
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-action="delete-session"]').first().click();
  await expect(page.locator('[data-session]')).toHaveCount(0);
  await expect(page.getByText('No workouts yet')).toBeVisible();
});

test('session notes are saved with the workout', async () => {
  await page.locator('[data-day="legs"]').click();
  await logSet(page, 'back-squat', 0, 185, 8);
  await page.locator('[data-note]').fill('Slept 5 hours, squats felt heavy.');
  await page.locator('[data-note]').blur();
  await page.locator('[data-action="finish"]').click();
  await tab(page, 'history');
  await expect(page.locator('[data-session]')).toContainText('Slept 5 hours');
});

test('every day of the split can be started and finished', async () => {
  for (const day of ['legs', 'pull', 'push', 'full']) {
    await tab(page, 'today');
    await page.locator(`[data-day="${day}"]`).click();
    const firstEx = await page.locator('.ex').first().getAttribute('data-ex');
    await logSet(page, firstEx, 0, 100, 10);
    await page.locator('[data-action="finish"]').click();
  }
  await expect(page.locator('#topbar-right')).toContainText('4 sessions');
  assert.deepEqual(app.errors, []);
});

test('a set row lays out on a single line at phone width', async () => {
  await page.locator('[data-day="legs"]').click();
  const row = page.locator('[data-ex="back-squat"] [data-set="0"]');
  const cells = ['[data-field="weight"]', '[data-field="reps"]', '[data-field="rpe"]', '[data-field="done"]', '[data-field="remove"]'];
  const boxes = [];
  for (const sel of cells) boxes.push(await row.locator(sel).boundingBox());
  const tops = boxes.map((b) => Math.round(b.y));
  assert.ok(Math.max(...tops) - Math.min(...tops) < 6, `controls wrapped onto separate lines: ${tops}`);
  const rowBox = await row.boundingBox();
  assert.ok(rowBox.height < 70, `row is ${rowBox.height}px tall — something wrapped`);
});

test('the page never scrolls sideways on a phone', async () => {
  await page.locator('[data-day="legs"]').click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  assert.ok(overflow <= 1, `page overflows horizontally by ${overflow}px`);
});
