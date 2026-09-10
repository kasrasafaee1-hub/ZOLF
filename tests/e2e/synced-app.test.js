import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch, expect, tab } from './harness.js';

// The published app runs WITH the db capability. Everything else in this suite
// runs without it, so these tests cover the configuration the user actually has.
const FAKE_HOST = () => {
  const KEY = '__fake_server_doc';
  const read = () => {
    try {
      return JSON.parse(sessionStorage.getItem(KEY) || 'null');
    } catch {
      return null;
    }
  };
  const write = (v) => sessionStorage.setItem(KEY, JSON.stringify(v));
  const watchers = [];
  window.__db = { sets: 0, gets: 0 };
  window.claude = {
    use: async (name) => {
      if (name !== 'db') return null;
      return {
        doc: () => ({
          async get() {
            window.__db.gets += 1;
            return read();
          },
          async set(value) {
            window.__db.sets += 1;
            write(value);
            // A real backend echoes our own write back through the watcher.
            for (const fn of watchers) setTimeout(() => fn(read()), 0);
          },
          onSnapshot(fn) {
            watchers.push(fn);
            return () => watchers.splice(watchers.indexOf(fn), 1);
          },
        }),
      };
    },
  };
};

let app;
let page;

before(async () => {
  app = await launch();
  page = app.page;
  await page.addInitScript(FAKE_HOST);
});
after(async () => app?.close());
beforeEach(async () => {
  // Clear the fake server too, then the local copy sync just pulled from it,
  // so each test starts from a genuinely empty slate.
  await app.reset();
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  await page.reload();
  await page.waitForSelector('.brand');
  await page.waitForSelector('[data-day="legs"]');
  app.errors.length = 0;
});

test('sync comes up and reports itself synced', async () => {
  await expect(page.locator('[data-sync]')).toHaveAttribute('data-sync', 'synced');
});

test('typing a weight is not interrupted when the debounced sync fires', async () => {
  await page.locator('[data-day="legs"]').click();
  const weight = page.locator('[data-ex="back-squat"] [data-set="0"] [data-field="weight"]');
  await weight.click();
  await weight.type('18', { delay: 30 });

  // The sync debounce is ~900ms. Sit inside the window where a stray re-render
  // would rip the field out from under the user, then keep typing.
  await page.waitForTimeout(1500);

  const stillFocused = await page.evaluate(
    () => document.activeElement?.getAttribute('data-field') === 'weight'
  );
  assert.ok(stillFocused, 'focus was stolen from the weight field mid-entry');

  await page.keyboard.type('5', { delay: 30 });
  await expect(weight).toHaveValue('185', 'the keystroke after the sync tick was lost');
});

test('a full workout can be logged with sync running', async () => {
  await page.locator('[data-day="legs"]').click();
  for (let i = 0; i < 4; i++) {
    const row = page.locator(`[data-ex="back-squat"] [data-set="${i}"]`);
    await row.locator('[data-field="weight"]').fill('185');
    await row.locator('[data-field="reps"]').fill('8');
    await row.locator('[data-field="done"]').click();
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1200);
  await page.locator('[data-action="finish"]').click();
  await tab(page, 'history');
  await expect(page.locator('[data-session]')).toHaveCount(1);
  await expect(page.locator('[data-session]')).toContainText('185×8');
  assert.deepEqual(app.errors, []);
});

test('the log is restored from the server after local storage is wiped', async () => {
  await page.locator('[data-day="legs"]').click();
  const row = page.locator('[data-ex="back-squat"] [data-set="0"]');
  await row.locator('[data-field="weight"]').fill('225');
  await row.locator('[data-field="reps"]').fill('5');
  await row.locator('[data-field="done"]').click();
  await page.locator('[data-action="finish"]').click();
  await page.waitForTimeout(1500);

  // Same tab keeps the in-page fake server; clearing storage simulates a
  // cleared browser on the same account.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.brand');
  await page.waitForTimeout(1200);
  await tab(page, 'history');
  await expect(page.locator('[data-session]')).toContainText('225×5');
});

test('our own echoed write does not churn the page', async () => {
  await page.locator('[data-day="legs"]').click();
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => window.__db.sets);
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => window.__db.sets);
  assert.ok(after - before <= 1, `sync wrote ${after - before} times while idle — feedback loop`);
});
