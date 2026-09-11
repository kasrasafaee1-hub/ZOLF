import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch, expect, tab, logSet } from '../e2e/harness.js';

// Runs against dist/amore-preview.html — the same code as the other suites,
// built for a different person. What differs is the programme, the wordmark and
// the body-composition maths, and each of those is checked here.
let app;
let page;

before(async () => {
  app = await launch();
  page = app.page;
});
after(async () => app?.close());
beforeEach(() => app.reset());

test('it is her app, not a copy of his', async () => {
  await expect(page.locator('.brand')).toContainText('AMORE');
  await expect(page.locator('.brand')).toContainText('SPLITS');
  const title = await page.title();
  assert.match(title, /Amore/);
});

test('her four days, on her days of the week', async () => {
  await expect(page.locator('[data-day]')).toHaveCount(4);
  await expect(page.locator('[data-day="push"] .eyebrow')).toHaveText('Tue');
  await expect(page.locator('[data-day="quads"] .eyebrow')).toHaveText('Wed');
  await expect(page.locator('[data-day="pull"] .eyebrow')).toHaveText('Thu');
  await expect(page.locator('[data-day="glutes"] .eyebrow')).toHaveText('Fri');
  await expect(page.locator('[data-day="glutes"]')).toContainText('Glutes & Hamstrings');
  await expect(page.locator('[data-day="quads"]')).toContainText('Quads · Calves · Core');
});

test('none of his days are here', async () => {
  await expect(page.locator('[data-day="legs"]')).toHaveCount(0);
  await expect(page.locator('[data-day="full"]')).toHaveCount(0);
});

test('the glute day leads with a hip thrust and is three working sets', async () => {
  await page.locator('[data-day="glutes"]').click();
  const first = page.locator('.ex').first();
  await expect(first).toContainText('Barbell hip thrust');
  await expect(first).toContainText('4 × 8–10');
  await expect(page.locator('[data-ex="rdl"]')).toContainText('3 × 8–10');
  await expect(page.locator('[data-ex="hip-thrust"] .setrow')).toHaveCount(4);
});

test('a session logs and files exactly as his does', async () => {
  await page.locator('[data-day="glutes"]').click();
  await logSet(page, 'hip-thrust', 0, 135, 10);
  await logSet(page, 'hip-thrust', 1, 135, 9);
  await page.locator('#finish-now').click();
  await tab(page, 'history');
  await expect(page.locator('[data-session]')).toHaveCount(1);
  await expect(page.locator('[data-session]')).toContainText('135×10');
  const date = await page.evaluate(() => window.__zolf.store.state.sessions[0].date);
  await expect(page.locator(`[data-day-cell="${date}"]`)).toHaveAttribute('data-trained', 'true');
});

test('body fat is read against female ranges, not male ones', async () => {
  await tab(page, 'body');
  await page.locator('[data-metric="weight"]').fill('134');
  await page.locator('[data-metric="bodyFatPct"]').fill('22');
  await page.locator('[data-action="save-metric"]').click();
  // 22% is athletic for a woman; the male scale would call it "average" and
  // tell her to cut.
  await expect(page.getByText(/22% body fat/)).toContainText('Athletic');
  await expect(page.locator('[data-banner="phase"]')).not.toContainText('ceiling');
});

test('her bulk ceiling sits where it should for a woman', async () => {
  await tab(page, 'settings');
  await expect(page.locator('[data-input="ceiling"]')).toHaveValue('28');
});

test('macros are computed from her lean mass', async () => {
  await tab(page, 'body');
  await page.locator('[data-metric="weight"]').fill('134');
  await page.locator('[data-metric="bodyFatPct"]').fill('22');
  await page.locator('[data-action="save-metric"]').click();
  // 134 lb at 22% -> 104.5 lb lean -> 1.1 g/lb -> 115 g protein.
  await expect(page.locator('[data-targets]')).toContainText('115');
  await expect(page.locator('[data-targets]')).toContainText('g');
});

test('protein and creatine work the same', async () => {
  await tab(page, 'body');
  await page.locator('[data-preset="25"]').click();
  await expect(page.locator('[data-protein-total]')).toContainText('25');
  await page.locator('[data-action="toggle-creatine"]').click();
  await expect(page.locator('[data-creatine-state]')).toHaveAttribute('data-creatine-state', 'taken');
});

test('the blocks rotate automatically and say when they change', async () => {
  await expect(page.locator('[data-rotation]')).toBeVisible();
  await expect(page.locator('[data-rotation]')).toContainText('new exercises in');
  await tab(page, 'settings');
  await expect(page.locator('[data-rotation-state]')).toHaveAttribute('data-rotation-state', 'on');
  await expect(page.locator('[data-select="program"]')).toBeDisabled();
});

test('her variation block trains the same days with different lifts', async () => {
  const blocks = await page.evaluate(() => {
    const { PROGRAM_SETS } = window.__zolf;
    return null;
  });
  // Drive it through the UI instead: turn rotation off and pick block B.
  await tab(page, 'settings');
  await page.locator('[data-action="toggle-rotation"]').click();
  await page.locator('[data-select="program"]').selectOption('block-b');
  await tab(page, 'today');
  for (const day of ['push', 'quads', 'pull', 'glutes']) {
    await expect(page.locator(`[data-day="${day}"]`)).toBeVisible();
  }
  await page.locator('[data-day="glutes"]').click();
  await expect(page.locator('[data-ex="single-leg-hip-thrust"]')).toBeVisible();
  await expect(page.locator('[data-ex="hip-thrust"]')).toHaveCount(0);
});

test('the page runs clean', async () => {
  await tab(page, 'progress');
  await tab(page, 'body');
  await tab(page, 'settings');
  await tab(page, 'history');
  assert.deepEqual(app.errors, []);
  assert.deepEqual(await page.evaluate(() => window.__zolf.faults), []);
});
