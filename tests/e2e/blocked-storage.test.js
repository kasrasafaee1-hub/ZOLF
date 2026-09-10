import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch, expect, logSet, tab } from './harness.js';

// An artifact runs in a sandboxed cross-origin iframe. iOS Safari makes
// localStorage THROW there under Private Browsing, blocked site data, or
// partitioned third-party storage. Every test above this file runs with
// storage working, which is exactly why this failure stayed invisible.
const BLOCK_STORAGE = () => {
  const boom = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: () => ({ getItem: boom, setItem: boom, removeItem: boom, clear: boom, key: boom, length: 0 }),
  });
};

let app;
let page;

before(async () => {
  app = await launch();
  page = app.page;
});
after(async () => app?.close());

beforeEach(async () => {
  await app.reset();
  await page.addInitScript(BLOCK_STORAGE);
  await page.reload();
  await page.waitForSelector('.brand');
  app.errors.length = 0;
});

test('the app still boots when the browser blocks storage', async () => {
  await expect(page.locator('[data-day="push"]')).toBeVisible();
  await expect(page.locator('[data-day]')).toHaveCount(4);
});

test('a set can be logged and ticks complete', async () => {
  await page.locator('[data-day="push"]').click();
  await logSet(page, 'bench-press', 0, 225, 5);
  const row = page.locator('[data-ex="bench-press"] [data-set="0"]');
  await expect(row.locator('[data-field="done"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(row.locator('[data-field="weight"]')).toHaveValue('225');
});

test('the finish bar counts sets with storage blocked', async () => {
  await page.locator('[data-day="push"]').click();
  await logSet(page, 'bench-press', 0, 225, 5);
  await logSet(page, 'bench-press', 1, 225, 5);
  await expect(page.locator('#finish-count')).toHaveText('2/14 sets');
});

test('a whole workout reaches the calendar and the log', async () => {
  await page.locator('[data-day="push"]').click();
  await logSet(page, 'bench-press', 0, 225, 5);
  await logSet(page, 'bench-press', 1, 230, 4);
  await page.locator('#finish-now').click();

  await tab(page, 'history');
  await expect(page.locator('[data-session]')).toHaveCount(1);
  await expect(page.locator('[data-session]')).toContainText('225×5');
  await expect(page.locator('[data-session]')).toContainText('230×4');

  const date = await page.evaluate(() => window.__zolf.store.state.sessions[0].date);
  await expect(page.locator(`[data-day-cell="${date}"]`)).toHaveAttribute('data-trained', 'true');
});

test('the day detail still opens with every number', async () => {
  await page.locator('[data-day="push"]').click();
  await logSet(page, 'bench-press', 0, 225, 5);
  await page.locator('#finish-now').click();
  await tab(page, 'history');
  const date = await page.evaluate(() => window.__zolf.store.state.sessions[0].date);
  await page.locator(`[data-day-cell="${date}"]`).click();
  await expect(page.locator(`[data-day-detail="${date}"]`)).toContainText('225 × 5');
});

test('protein and creatine still log', async () => {
  await tab(page, 'body');
  await page.locator('[data-preset="25"]').click();
  await expect(page.locator('[data-protein-total]')).toContainText('25');
  await page.locator('[data-action="toggle-creatine"]').click();
  await expect(page.locator('[data-creatine-state]')).toHaveAttribute('data-creatine-state', 'taken');
});

test('the app says plainly that nothing is being saved', async () => {
  await tab(page, 'settings');
  const warning = page.locator('[data-storage-warning]');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('blocking storage');
  await expect(page.locator('[data-diag-row="Saved on this device"]')).toContainText('NO');
});

test('no unhandled error escapes into the console', async () => {
  await page.locator('[data-day="push"]').click();
  await logSet(page, 'bench-press', 0, 225, 5);
  await page.locator('#finish-now').click();
  await tab(page, 'history');
  await tab(page, 'progress');
  await tab(page, 'body');
  await tab(page, 'settings');
  assert.deepEqual(app.errors, []);
  assert.deepEqual(await page.evaluate(() => window.__zolf.faults), []);
});
