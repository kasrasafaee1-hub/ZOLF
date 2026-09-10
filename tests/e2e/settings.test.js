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

test('switching block keeps the four days but changes the lifts', async () => {
  await tab(page, 'today');
  await page.locator('[data-day="push"]').click();
  await expect(page.locator('[data-ex="bench-press"]')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await tab(page, 'settings');
  await page.locator('[data-select="program"]').selectOption('block-b');
  await expect(page.getByText('same muscles, different lifts')).toBeVisible();

  await tab(page, 'today');
  // Same four days...
  for (const day of ['push', 'pull', 'legs', 'full']) {
    await expect(page.locator(`[data-day="${day}"]`)).toBeVisible();
  }
  // ...different exercises inside them.
  await page.locator('[data-day="push"]').click();
  await expect(page.locator('[data-ex="incline-bb-press"]')).toBeVisible();
  await expect(page.locator('[data-ex="bench-press"]')).toHaveCount(0);
});

test('switching program mid-workout asks before dropping the session', async () => {
  await tab(page, 'today');
  await page.locator('[data-day="legs"]').click();
  await logSet(page, 'back-squat', 0, 185, 8);
  await tab(page, 'settings');
  page.once('dialog', (d) => d.dismiss());
  await page.locator('[data-select="program"]').selectOption('block-b');
  const programId = await page.evaluate(() => window.__zolf.store.state.settings.programId);
  assert.equal(programId, 'block-a', 'declining the prompt keeps the program and the workout');
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

test('each exercise rests for the time its own programme prescribes', async () => {
  // The sheet asks for 3 minutes after squats and 60 seconds after calf
  // raises; a single global setting would flatten that distinction.
  await page.locator('[data-select="rest"]').selectOption('60');
  await tab(page, 'today');
  await page.locator('[data-day="legs"]').click();
  await logSet(page, 'back-squat', 0, 185, 8);
  await expect(page.locator('#rest-time')).toHaveText(/^(3:00|2:5\d)$/);
  await page.locator('#rest-skip').click();

  await page.locator('[data-toggle="standing-calf"]').click();
  await logSet(page, 'standing-calf', 0, 90, 15);
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
  await page.locator('[data-select="program"]').selectOption('block-b');
  await page.locator('[data-select="rest"]').selectOption('180');
  await page.reload();
  await tab(page, 'settings');
  await expect(page.locator('[data-select="program"]')).toHaveValue('block-b');
  await expect(page.locator('[data-select="rest"]')).toHaveValue('180');
});

test('export produces a downloadable backup of the log', async () => {
  await tab(page, 'today');
  await page.locator('[data-day="legs"]').click();
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
    settings: { programId: 'block-a', activityId: 'moderate', phaseId: 'bulk', restSeconds: 150, bodyFatCeiling: 20 },
    sessions: [
      {
        id: 'imported',
        dayId: 'legs',
        dayName: 'Legs',
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
  await page.locator('[data-day="legs"]').click();
  await logSet(page, 'back-squat', 0, 185, 8);
  await page.locator('[data-action="finish"]').click();
  await tab(page, 'settings');
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-action="reset"]').click();
  await expect(page.locator('#topbar-right')).toContainText('0 sessions');
  assert.deepEqual(app.errors, []);
});

test('export goes through the downloads capability when the host provides one', async () => {
  // The artifact viewer makes <a download> inert, so the page must hand the
  // file to window.claude.downloads instead. Stand in for that host here.
  await page.addInitScript(() => {
    window.__saves = [];
    window.claude = {
      use: async (name) =>
        name === 'downloads'
          ? {
              save: async (req) => {
                window.__saves.push({ filename: req.filename, data: req.data });
                return { status: 'saved' };
              },
            }
          : null,
    };
  });
  await app.reset();
  await tab(page, 'today');
  await page.locator('[data-day="legs"]').click();
  await logSet(page, 'back-squat', 0, 185, 8);
  await page.locator('[data-action="finish"]').click();
  await tab(page, 'settings');

  await page.locator('[data-action="export"]').click();
  await expect(page.locator('#toast')).toContainText('Exported');

  const saves = await page.evaluate(() => window.__saves);
  assert.equal(saves.length, 1, 'the file went through the capability, not an anchor');
  assert.match(saves[0].filename, /^zolf-lift-\d{4}-\d{2}-\d{2}\.json$/);
  const parsed = JSON.parse(saves[0].data);
  assert.equal(parsed.sessions.length, 1);
  assert.equal(parsed.sessions[0].entries[0].sets[0].weight, '185');

  await page.addInitScript(() => {
    delete window.claude;
  });
  await app.reset();
});

test('a viewer declining the save is reported, not retried', async () => {
  await page.addInitScript(() => {
    window.__saveAttempts = 0;
    window.claude = {
      use: async (name) =>
        name === 'downloads'
          ? {
              save: async () => {
                window.__saveAttempts += 1;
                throw { code: 'declined', message: 'viewer said no' };
              },
            }
          : null,
    };
  });
  await app.reset();
  await tab(page, 'settings');
  await page.locator('[data-action="export"]').click();
  await expect(page.locator('#toast')).toContainText('cancelled');
  assert.equal(await page.evaluate(() => window.__saveAttempts), 1, 'no auto-retry');

  await page.addInitScript(() => {
    delete window.claude;
  });
  await app.reset();
});
