import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch, expect, tab } from './harness.js';

let app;
let page;

const scan = async () => {
  await page.locator('[data-metric="weight"]').fill('179.7');
  await page.locator('[data-metric="bodyFatPct"]').fill('16.5');
  await page.locator('[data-action="save-metric"]').click();
};

before(async () => {
  app = await launch();
  page = app.page;
});
after(async () => app?.close());
beforeEach(async () => {
  await app.reset();
  await tab(page, 'body');
});

test('protein starts at zero against the computed target', async () => {
  await scan();
  await expect(page.locator('[data-fuel="protein"]')).toBeVisible();
  await expect(page.locator('[data-protein-total]')).toContainText('0');
  await expect(page.locator('[data-protein-total]')).toContainText('/ 165 g');
  await expect(page.locator('[data-protein-pct]')).toHaveText('0%');
});

test('a quick-add preset adds its grams', async () => {
  await scan();
  await page.locator('[data-preset="25"]').click();
  await expect(page.locator('[data-protein-total]')).toContainText('25');
  await expect(page.locator('[data-protein-left]')).toContainText('140 g to go');
});

test('presets accumulate through the day', async () => {
  await scan();
  await page.locator('[data-preset="25"]').click();
  await page.locator('[data-preset="50"]').click();
  await page.locator('[data-preset="20"]').click();
  await expect(page.locator('[data-protein-total]')).toContainText('95');
  await expect(page.locator('[data-protein-entry]')).toHaveCount(3);
});

test('a custom amount can be entered', async () => {
  await scan();
  await page.locator('[data-input="protein-custom"]').fill('42');
  await page.locator('[data-action="add-protein"]').click();
  await expect(page.locator('[data-protein-total]')).toContainText('42');
  await expect(page.locator('#toast')).toContainText('42');
});

test('a custom amount with no number is refused', async () => {
  await scan();
  await page.locator('[data-action="add-protein"]').click();
  await expect(page.locator('#toast')).toContainText('Enter grams');
  await expect(page.locator('[data-protein-entry]')).toHaveCount(0);
});

test('an entry logged by mistake can be removed', async () => {
  await scan();
  await page.locator('[data-preset="25"]').click();
  await page.locator('[data-preset="50"]').click();
  await expect(page.locator('[data-protein-total]')).toContainText('75');
  await page.locator('[data-protein-entry] .fuel-remove').first().click();
  await expect(page.locator('[data-protein-entry]')).toHaveCount(1);
  await expect(page.locator('[data-protein-total]')).toContainText('50');
});

test('hitting the target is called out rather than left at a percentage', async () => {
  await scan();
  await page.locator('[data-input="protein-custom"]').fill('165');
  await page.locator('[data-action="add-protein"]').click();
  await expect(page.locator('[data-protein-pct]')).toHaveText('100%');
  await expect(page.locator('[data-protein-left]')).toContainText('Target hit');
});

test('the bar never overflows past full', async () => {
  await scan();
  await page.locator('[data-input="protein-custom"]').fill('400');
  await page.locator('[data-action="add-protein"]').click();
  await expect(page.locator('[data-protein-pct]')).toHaveText('100%');
  const width = await page.locator('.fuel-bar > i').evaluate((n) => n.style.width);
  assert.equal(width, '100%');
});

test('creatine is one tap, and undoable', async () => {
  await scan();
  await expect(page.locator('[data-creatine-state]')).toHaveAttribute('data-creatine-state', 'not-taken');
  await page.locator('[data-action="toggle-creatine"]').click();
  await expect(page.locator('[data-creatine-state]')).toHaveAttribute('data-creatine-state', 'taken');
  await expect(page.locator('[data-creatine-state]')).toContainText('5 g taken');
  await page.locator('[data-action="toggle-creatine"]').click();
  await expect(page.locator('[data-creatine-state]')).toHaveAttribute('data-creatine-state', 'not-taken');
});

test('taking creatine starts the streak and moves adherence', async () => {
  await scan();
  await page.locator('[data-action="toggle-creatine"]').click();
  const stats = page.locator('[data-creatine-stats] .stat');
  await expect(stats.filter({ hasText: 'Streak' })).toContainText('1');
  await expect(stats.filter({ hasText: 'Last 30 days' })).toContainText('1/30');
  await expect(page.locator('#toast')).toContainText('streak');
});

test('a run of days reads as a streak', async () => {
  await scan();
  await page.evaluate(() => {
    const s = window.__zolf.store;
    const iso = (off) => {
      const d = new Date();
      d.setDate(d.getDate() - off);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    for (const off of [0, 1, 2, 3, 4]) s.setCreatine(5, iso(off));
    window.__zolf.render();
  });
  await expect(page.locator('[data-creatine-stats] .stat').filter({ hasText: 'Streak' })).toContainText('5');
});

test('the week verdict is honest when protein is short', async () => {
  await scan();
  await page.locator('[data-input="protein-custom"]').fill('80');
  await page.locator('[data-action="add-protein"]').click();
  const banner = page.locator('[data-protein-week]');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/cost you muscle|short of/i);
});

test('fuel survives a reload', async () => {
  await scan();
  await page.locator('[data-preset="25"]').click();
  await page.locator('[data-action="toggle-creatine"]').click();
  await page.reload();
  await tab(page, 'body');
  await expect(page.locator('[data-protein-total]')).toContainText('25');
  await expect(page.locator('[data-creatine-state]')).toHaveAttribute('data-creatine-state', 'taken');
});

test('fuel works before any scan exists, without a target', async () => {
  await expect(page.locator('[data-fuel="protein"]')).toBeVisible();
  await page.locator('[data-preset="25"]').click();
  await expect(page.locator('[data-protein-total]')).toContainText('25');
  await expect(page.locator('[data-protein-left]')).toContainText('InBody scan');
  assert.deepEqual(app.errors, []);
});

test('the fuel section never scrolls the page sideways', async () => {
  await scan();
  await page.locator('[data-preset="25"]').click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  assert.ok(overflow <= 1, `page overflows by ${overflow}px`);
});
