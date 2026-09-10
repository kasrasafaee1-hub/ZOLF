import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch, expect, logSet, tab } from './harness.js';

let app;
let page;

const seed = (dates) =>
  page.evaluate((rows) => {
    const s = window.__zolf.store;
    s.update((state) => ({
      ...state,
      sessions: rows.map((date, i) => ({
        id: 'seed' + i,
        dayId: 'legs',
        dayName: 'Legs',
        date,
        entries: [
          { exerciseId: 'back-squat', name: 'Back Squat', muscle: 'quads', sets: [{ weight: 185, reps: 8, done: true }] },
        ],
      })),
    }));
    window.__zolf.render();
  }, dates);

const iso = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

before(async () => {
  app = await launch();
  page = app.page;
});
after(async () => app?.close());
beforeEach(async () => {
  await app.reset();
  await tab(page, 'history');
});

test('the calendar shows the current month with every day drawn', async () => {
  const now = new Date();
  const monthName = now.toLocaleDateString('en-US', { month: 'long' });
  await expect(page.locator('[data-cal-title]')).toContainText(`${monthName} ${now.getFullYear()}`);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  await expect(page.locator('[data-day-cell]')).toHaveCount(daysInMonth);
});

test('a trained day is gold and a rest day is not', async () => {
  const trained = iso(1);
  await seed([trained]);
  await expect(page.locator(`[data-day-cell="${trained}"]`)).toHaveClass(/trained/);
  await expect(page.locator(`[data-day-cell="${trained}"]`)).toHaveAttribute('data-trained', 'true');

  const rest = iso(2);
  await expect(page.locator(`[data-day-cell="${rest}"]`)).toHaveAttribute('data-trained', 'false');
  await expect(page.locator(`[data-day-cell="${rest}"]`)).toHaveClass(/rest/);
});

test('today is marked, and future days are dimmed rather than called rest', async () => {
  await expect(page.locator(`[data-day-cell="${iso(0)}"]`)).toHaveClass(/today/);
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  if (last.getDate() !== now.getDate()) {
    const tomorrow = iso(-1);
    await expect(page.locator(`[data-day-cell="${tomorrow}"]`)).toHaveClass(/future/);
  }
});

test('a trained day names the session it holds', async () => {
  const d = iso(1);
  await seed([d]);
  await expect(page.locator(`[data-day-cell="${d}"]`)).toHaveAttribute('title', new RegExp('Legs'));
});

test('the month can be paged back and forward', async () => {
  const title = page.locator('[data-cal-title]');
  const start = await title.textContent();
  await page.locator('[data-cal="prev"]').click();
  const prev = await title.textContent();
  assert.notEqual(prev, start);
  await page.locator('[data-cal="next"]').click();
  await expect(title).toHaveText(start);
});

test('paging back twelve months lands on the same month a year earlier', async () => {
  const now = new Date();
  for (let i = 0; i < 12; i++) await page.locator('[data-cal="prev"]').click();
  const monthName = now.toLocaleDateString('en-US', { month: 'long' });
  await expect(page.locator('[data-cal-title]')).toHaveText(`${monthName} ${now.getFullYear() - 1}`);
});

test('every counter label fits on one line so the tiles align', async () => {
  await seed([iso(1)]);
  for (const label of ['This month', 'Streak', 'Days since']) {
    const k = page.locator('[data-cal-stats] .stat .k').filter({ hasText: label });
    const box = await k.boundingBox();
    assert.ok(box.height < 24, `"${label}" wrapped onto two lines (${box.height}px)`);
  }
});

test('the counters report sessions, streak and days since', async () => {
  await seed([iso(1), iso(3)]);
  const stats = page.locator('[data-cal-stats] .stat');
  await expect(stats.filter({ hasText: 'This month' })).toContainText('2');
  await expect(stats.filter({ hasText: 'Days since' })).toContainText('1');
  await expect(stats.filter({ hasText: 'Streak' })).toBeVisible();
});

test('with nothing logged the counters read empty, not broken', async () => {
  const stats = page.locator('[data-cal-stats] .stat');
  await expect(stats.filter({ hasText: 'This month' })).toContainText('0');
  await expect(stats.filter({ hasText: 'Days since' })).toContainText('–');
  assert.deepEqual(app.errors, []);
});

test('finishing a workout lights up today on the calendar', async () => {
  await tab(page, 'today');
  await page.locator('[data-day="legs"]').click();
  await logSet(page, 'back-squat', 0, 185, 8);
  await page.locator('[data-action="finish"]').click();
  await tab(page, 'history');
  await expect(page.locator(`[data-day-cell="${iso(0)}"]`)).toHaveClass(/trained/);
});

test('the calendar never scrolls the page sideways', async () => {
  await seed([iso(1), iso(3)]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  assert.ok(overflow <= 1, `page overflows by ${overflow}px`);
});

test('each day shows the weekday it runs and its patron', async () => {
  await tab(page, 'today');
  await expect(page.locator('[data-day="push"] .eyebrow')).toHaveText('Mon · Zeus');
  await expect(page.locator('[data-day="pull"] .eyebrow')).toHaveText('Tue · Herakles');
  await expect(page.locator('[data-day="legs"] .eyebrow')).toHaveText('Thu · Atlas');
  await expect(page.locator('[data-day="full"] .eyebrow')).toHaveText('Sat · Olympus');
  await expect(page.locator('[data-day="push"]')).toContainText('Chest · Shoulders · Triceps');
  await page.locator('[data-day="legs"]').click();
  await expect(page.locator('.eyebrow').first()).toContainText('Under Atlas');
});
