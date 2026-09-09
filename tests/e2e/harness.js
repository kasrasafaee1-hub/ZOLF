// End-to-end harness: one static server and one browser shared by the whole
// file, driven with node:test. Playwright's own runner cannot launch a browser
// in this container, so we drive playwright-core directly.
import { existsSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { expect } from '@playwright/test';
import { startStaticServer } from '../../scripts/server.js';

const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].filter(Boolean);

function findBrowser() {
  const hit = CANDIDATES.find((p) => existsSync(p));
  if (!hit) throw new Error('No Chromium found. Set CHROMIUM_PATH.');
  return hit;
}

export { expect, devices };

export async function launch({ device = 'iPhone 13' } = {}) {
  const site = await startStaticServer(0);
  const browser = await chromium.launch({
    executablePath: findBrowser(),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({ ...devices[device], baseURL: site.url });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  return {
    page,
    errors,
    /** Fresh app with empty storage. */
    async reset() {
      await page.goto(site.url + '/index.html');
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForSelector('.brand');
      errors.length = 0;
    },
    async close() {
      await context.close();
      await browser.close();
      await site.close();
    },
  };
}

/** Fill a set row and tick it complete. */
export async function logSet(page, exerciseId, index, weight, reps) {
  const row = page.locator(`[data-ex="${exerciseId}"] [data-set="${index}"]`);
  if (weight !== null) await row.locator('[data-field="weight"]').fill(String(weight));
  if (reps !== null) await row.locator('[data-field="reps"]').fill(String(reps));
  await row.locator('[data-field="done"]').click();
}

export const tab = (page, name) => page.locator(`.tab[data-tab="${name}"]`).click();
