import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch, expect, logSet, tab } from './harness.js';

// A workout only reaches the log when it is finished. Every one of these
// guards the path from "sets are logged" to "it is in the calendar", which is
// where the app was losing people.
let app;
let page;

before(async () => {
  app = await launch();
  page = app.page;
});
after(async () => app?.close());
beforeEach(() => app.reset());

test('there is no finish bar until a workout is open', async () => {
  await expect(page.locator('#finish-bar')).toBeHidden();
});

test('starting a workout puts finishing on screen straight away', async () => {
  await page.locator('[data-day="push"]').click();
  await expect(page.locator('#finish-bar')).toBeVisible();
  await expect(page.locator('#finish-count')).toHaveText('0/22 sets');
  await expect(page.locator('#finish-day')).toHaveText('Push');
});

test('the finish bar is reachable without scrolling, on a phone', async () => {
  await page.locator('[data-day="push"]').click();
  await logSet(page, 'bench-press', 0, 185, 8);

  const viewport = page.viewportSize();
  const box = await page.locator('#finish-now').boundingBox();
  assert.ok(box, 'the finish button is not on the page');
  assert.ok(
    box.y >= 0 && box.y + box.height <= viewport.height,
    `finish button sits at y=${box.y} in a ${viewport.height}px viewport — off screen`
  );
  // And it is genuinely clickable where it sits, not covered by the tab bar.
  const onTop = await page.locator('#finish-now').evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el.contains(hit) || el === hit;
  });
  assert.ok(onTop, 'something is covering the finish button');
});

test('the count tracks sets as they are logged', async () => {
  await page.locator('[data-day="push"]').click();
  await logSet(page, 'bench-press', 0, 185, 8);
  await expect(page.locator('#finish-count')).toHaveText('1/22 sets');
  await logSet(page, 'bench-press', 1, 185, 8);
  await expect(page.locator('#finish-count')).toHaveText('2/22 sets');
});

test('finishing is refused until something is actually logged', async () => {
  await page.locator('[data-day="push"]').click();
  await expect(page.locator('#finish-now')).toBeDisabled();
  await expect(page.locator('#finish-now')).toHaveText('Log a set first');
  await logSet(page, 'bench-press', 0, 185, 8);
  await expect(page.locator('#finish-now')).toBeEnabled();
  await expect(page.locator('#finish-now')).toHaveText('Finish workout');
});

test('the sticky button files the workout into the calendar and the log', async () => {
  await page.locator('[data-day="push"]').click();
  await logSet(page, 'bench-press', 0, 185, 8);
  await logSet(page, 'bench-press', 1, 190, 6);
  await page.locator('#finish-now').click();

  await expect(page.locator('#finish-bar')).toBeHidden();
  await tab(page, 'history');
  await expect(page.locator('[data-session]')).toHaveCount(1);
  await expect(page.locator('[data-session]')).toContainText('185×8');
  await expect(page.locator('[data-session]')).toContainText('190×6');

  const todayCell = await page.evaluate(() => window.__zolf.store.state.sessions[0].date);
  await expect(page.locator(`[data-day-cell="${todayCell}"]`)).toHaveAttribute('data-trained', 'true');
});

test('the finish bar follows you onto every other tab', async () => {
  await page.locator('[data-day="push"]').click();
  await logSet(page, 'bench-press', 0, 185, 8);
  for (const name of ['history', 'progress', 'body', 'settings']) {
    await tab(page, name);
    await expect(page.locator('#finish-bar')).toBeVisible();
  }
});

test('an open workout is called out on the log, not silently missing', async () => {
  await page.locator('[data-day="push"]').click();
  await logSet(page, 'bench-press', 0, 185, 8);
  await tab(page, 'history');
  const banner = page.locator('[data-active-banner]');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Push is still open');
  await expect(banner).toContainText('1 set logged');
  await expect(page.locator('[data-session]')).toHaveCount(0);
});

test('it can be finished straight from the log', async () => {
  await page.locator('[data-day="push"]').click();
  await logSet(page, 'bench-press', 0, 225, 5);
  await tab(page, 'history');
  await page.locator('[data-action="finish-from-log"]').click();
  await expect(page.locator('[data-active-banner]')).toHaveCount(0);
  await expect(page.locator('[data-session]')).toHaveCount(1);
  await expect(page.locator('[data-session]')).toContainText('225×5');
});

test('today is marked as open on the calendar while the workout runs', async () => {
  await page.locator('[data-day="push"]').click();
  await logSet(page, 'bench-press', 0, 185, 8);
  await tab(page, 'history');
  const date = await page.evaluate(() => window.__zolf.store.state.active.date);
  const cell = page.locator(`[data-day-cell="${date}"]`);
  await expect(cell).toHaveClass(/pending/);
  await expect(cell).toHaveAttribute('title', /not finished yet/);
});

test('an open workout survives a reload with its bar intact', async () => {
  await page.locator('[data-day="push"]').click();
  await logSet(page, 'bench-press', 0, 185, 8);
  await page.reload();
  await page.waitForSelector('.brand');
  await expect(page.locator('#finish-bar')).toBeVisible();
  await expect(page.locator('#finish-count')).toHaveText('1/22 sets');
  await page.locator('#finish-now').click();
  await tab(page, 'history');
  await expect(page.locator('[data-session]')).toHaveCount(1);
});

test('the rest timer and the finish bar do not sit on top of each other', async () => {
  await page.locator('[data-day="push"]').click();
  await logSet(page, 'bench-press', 0, 185, 8);
  const rest = await page.locator('#rest-bar').boundingBox();
  const finish = await page.locator('#finish-bar').boundingBox();
  assert.ok(rest && finish);
  assert.ok(
    rest.y + rest.height <= finish.y + 1,
    `rest bar (${rest.y}–${rest.y + rest.height}) overlaps the finish bar (from ${finish.y})`
  );
  assert.deepEqual(app.errors, []);
});
