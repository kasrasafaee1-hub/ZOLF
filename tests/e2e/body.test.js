import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch, expect, tab } from './harness.js';

let app;
let page;

const saveScan = async (weight, bf, smm) => {
  await page.locator('[data-metric="weight"]').fill(String(weight));
  await page.locator('[data-metric="bodyFatPct"]').fill(String(bf));
  if (smm != null) await page.locator('[data-metric="smm"]').fill(String(smm));
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

test('asks for a scan before it will show any targets', async () => {
  await expect(page.locator('[data-banner="phase"]')).toHaveCount(0);
  await expect(page.getByText('Add your InBody numbers')).toBeVisible();
});

test('entering the InBody numbers produces the calorie and macro plan', async () => {
  await saveScan(179.7, 16.5, 85.3);
  const targets = page.locator('[data-targets]');
  await expect(targets).toBeVisible();
  // Katch-McArdle on 150 lb lean mass x 1.5 activity x 1.12 surplus.
  await expect(targets).toContainText('3,091');
  await expect(targets).toContainText('165');
  await expect(page.getByText(/BMR 1,840/)).toBeVisible();
  await expect(page.getByText(/16.5% body fat/)).toBeVisible();
});

test('saving a scan also records the bodyweight', async () => {
  await saveScan(179.7, 16.5);
  await expect(page.locator('[data-metric-row]')).toHaveCount(1);
  const bw = await page.evaluate(() => window.__zolf.store.state.bodyweights.length);
  assert.equal(bw, 1);
});

test('a scan without weight or body fat is refused', async () => {
  await page.locator('[data-metric="smm"]').fill('85');
  await page.locator('[data-action="save-metric"]').click();
  await expect(page.locator('#toast')).toContainText('required');
  await expect(page.locator('[data-metric-row]')).toHaveCount(0);
});

test('switching phase changes the calorie target', async () => {
  await saveScan(179.7, 16.5);
  const bulk = await page.locator('[data-targets]').textContent();
  await page.locator('[data-phase="cut"]').click();
  const cut = await page.locator('[data-targets]').textContent();
  assert.notEqual(bulk, cut);
  await expect(page.locator('[data-targets]')).toContainText('2,208'); // 2760 * 0.8
  await expect(page.locator('[data-banner="phase"]')).toContainText('Cut');
});

test('bodyweight logging draws a trend and reports the weekly rate', async () => {
  await page.evaluate(() => {
    const s = window.__zolf.store;
    s.addBodyweight(179.0, '2026-09-01');
    s.addBodyweight(180.0, '2026-09-08');
    s.addBodyweight(181.0, '2026-09-15');
    window.__zolf.render();
  });
  await expect(page.locator('[data-rate]')).toContainText('+1 lb/week');
  await expect(page.locator('svg.chart').first()).toBeVisible();
});

test('gaining too fast on a bulk raises a warning', async () => {
  await saveScan(179.7, 16.5);
  await page.evaluate(() => {
    const s = window.__zolf.store;
    s.addBodyweight(179.0, '2026-09-01');
    s.addBodyweight(183.0, '2026-09-08');
    window.__zolf.render();
  });
  const banner = page.locator('[data-banner="phase"]');
  await expect(banner).toContainText('too fast');
  await expect(banner).toHaveClass(/warn/);
});

test('hitting the body-fat ceiling tells you to stop bulking', async () => {
  await saveScan(190, 21);
  const banner = page.locator('[data-banner="phase"]');
  await expect(banner).toContainText('ceiling');
  await expect(banner).toContainText('Switch to a cut');
  await expect(banner).toHaveClass(/stop/);
});

test('rejecting a bodyweight entry with no number', async () => {
  await page.locator('[data-action="log-bodyweight"]').click();
  await expect(page.locator('#toast')).toContainText('Enter a weight');
});

test('a scan can be deleted', async () => {
  await saveScan(179.7, 16.5);
  await expect(page.locator('[data-metric-row]')).toHaveCount(1);
  await page.locator('[data-metric-row] button').click();
  await expect(page.locator('[data-metric-row]')).toHaveCount(0);
});

test('scan history charts muscle and fat once there are two scans', async () => {
  await saveScan(179.7, 16.5, 85.3);
  await page.evaluate(() => {
    window.__zolf.store.addMetric({ date: '2026-12-01', weight: 186, bodyFatPct: 18.1, smm: 88.4 });
    window.__zolf.render();
  });
  await expect(page.locator('[data-metric-row]')).toHaveCount(2);
  const charts = page.locator('svg.chart');
  assert.ok((await charts.count()) >= 2);
  assert.deepEqual(app.errors, []);
});
