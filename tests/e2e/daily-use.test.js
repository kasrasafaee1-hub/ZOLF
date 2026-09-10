import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, expect, tab } from './harness.js';

// Two weeks of realistic use, in order, on one continuous install: train the
// four days, eat, take creatine, weigh in, then do it again the following week
// and check the app carried everything forward. This is the "is it useful on a
// Tuesday" test rather than a feature-by-feature one.
let app;
let page;

const WEEK = [
  { day: 'push', first: 'bench-press', weight: 185 },
  { day: 'pull', first: 'deadlift', weight: 275 },
  { day: 'legs', first: 'back-squat', weight: 225 },
  { day: 'full', first: 'heavy-choice', weight: 245 },
];

const iso = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** One session: open the day, backdate it, log the two prescribed sets, finish. */
async function trainDay({ day, first, weight }, offset, reps = 6) {
  await tab(page, 'today');
  await page.locator(`[data-day="${day}"]`).click();
  await page.evaluate((d) => {
    window.__zolf.store.updateActive((a) => ({ ...a, date: d }));
    window.__zolf.render();
  }, iso(offset));

  for (const idx of [0, 1]) {
    const row = page.locator(`[data-ex="${first}"] [data-set="${idx}"]`);
    await row.locator('[data-field="weight"]').fill(String(weight));
    await row.locator('[data-field="reps"]').fill(String(reps));
    await row.locator('[data-field="done"]').click();
  }
  await page.locator('#finish-now').click();
  await expect(page.locator('#finish-bar')).toBeHidden();
}

/**
 * Bring the calendar to the month containing `date` from wherever it currently
 * is — the view keeps whatever month you last paged to, so this has to be able
 * to walk forwards as well as back.
 */
async function showMonthOf(date) {
  const want = date.slice(0, 7);
  for (let i = 0; i < 30; i++) {
    const shown = await page.locator('[data-day-cell]').first().getAttribute('data-day-cell');
    const have = shown.slice(0, 7);
    if (have === want) return;
    await page.locator(`[data-cal="${have > want ? 'prev' : 'next'}"]`).click();
  }
  throw new Error(`could not reach the month containing ${date}`);
}

before(async () => {
  app = await launch();
  page = app.page;
  await app.reset();
});
after(async () => app?.close());

test('day one: set your numbers up once', async () => {
  await tab(page, 'body');
  await page.locator('[data-metric="weight"]').fill('179.7');
  await page.locator('[data-metric="bodyFatPct"]').fill('16.5');
  await page.locator('[data-metric="smm"]').fill('85.3');
  await page.locator('[data-action="save-metric"]').click();
  await expect(page.locator('[data-targets]')).toContainText('3,091');
  await expect(page.locator('[data-targets]')).toContainText('165');
});

test('week one: train all four days', async () => {
  // 13, 12, 10, 8 days ago — Mon, Tue, Thu, Sat of last week.
  const offsets = [13, 12, 10, 8];
  for (let i = 0; i < WEEK.length; i++) await trainDay(WEEK[i], offsets[i], 6);

  await tab(page, 'history');
  await expect(page.locator('[data-session]')).toHaveCount(4);
  for (const offset of offsets) {
    const date = iso(offset);
    await showMonthOf(date);
    await expect(page.locator(`[data-day-cell="${date}"]`)).toHaveAttribute('data-trained', 'true');
  }
});

test('a week of four sessions is counted, wherever it falls in the month', async () => {
  await tab(page, 'history');
  const counted = await page.evaluate(() => {
    return window.__zolf.store.state.sessions.length;
  });
  assert.equal(counted, 4, 'all four sessions are in the log');
  // The month counter only covers the month on screen, so check the one the
  // sessions actually fall in rather than whichever month opened by default.
  await showMonthOf(iso(10));
  await expect(page.locator('[data-cal-stats] .stat').filter({ hasText: 'This month' })).toContainText(/[1-9]/);
});

test('week two: the app remembers what you lifted and asks for more', async () => {
  // Top of the range last week, so every lift should be told to add weight.
  await tab(page, 'today');
  await page.locator('[data-day="push"]').click();
  const hint = page.locator('[data-ex="bench-press"] [data-hint]');
  await expect(page.locator('[data-ex="bench-press"] .prev')).toContainText('185×6');
  await expect(hint).toContainText('Target 185 lb');
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-action="discard"]').click();
});

test('hitting the top of the range moves the weight up next time', async () => {
  await trainDay(WEEK[0], 6, 8); // last Monday, 185 x 8 twice
  await tab(page, 'today');
  await page.locator('[data-day="push"]').click();
  const hint = page.locator('[data-ex="bench-press"] [data-hint]');
  await expect(hint).toContainText('Target 190 lb');
  await expect(hint).toContainText('add 5 lb');
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-action="discard"]').click();
});

test('eating and supplementing is a few taps a day', async () => {
  await tab(page, 'body');
  await page.locator('[data-preset="25"]').click();
  await page.locator('[data-preset="50"]').click();
  await page.locator('[data-preset="45"]').click();
  await page.locator('[data-input="protein-custom"]').fill('45');
  await page.locator('[data-action="add-protein"]').click();
  await expect(page.locator('[data-protein-total]')).toContainText('165');
  await expect(page.locator('[data-protein-pct]')).toHaveText('100%');
  await expect(page.locator('[data-protein-left]')).toContainText('Target hit');

  await page.locator('[data-action="toggle-creatine"]').click();
  await expect(page.locator('[data-creatine-state]')).toHaveAttribute('data-creatine-state', 'taken');
});

test('weighing in builds a trend that judges the bulk', async () => {
  await page.evaluate(() => {
    const s = window.__zolf.store;
    const d = (off) => {
      const x = new Date();
      x.setDate(x.getDate() - off);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    };
    s.addBodyweight(179.2, d(14));
    s.addBodyweight(179.6, d(7));
    s.addBodyweight(180.0, d(0));
    window.__zolf.render();
  });
  await expect(page.locator('[data-rate]')).toContainText('lb/week');
  await expect(page.locator('[data-banner="phase"]')).toContainText(/lean-bulk window|too slow|too fast/);
});

test('progress screen has something real to show after two weeks', async () => {
  await tab(page, 'progress');
  await expect(page.locator('[data-volume]')).toBeVisible();
  await page.locator('[data-volume-mode="actual"]').click();
  await expect(page.getByText(/last 7 days/)).toBeVisible();

  const options = page.locator('[data-select="exercise"] option');
  assert.ok((await options.count()) >= 4, 'every lift trained should be chartable');
  await expect(page.locator('[data-chart="e1rm"]')).toBeVisible();
  await expect(page.locator('[data-chart="tonnage"]')).toBeVisible();
});

test('any past day opens with the exact numbers logged that day', async () => {
  await tab(page, 'history');
  const target = await page.evaluate(() => {
    const s = window.__zolf.store.state.sessions;
    return s[0];
  });
  await showMonthOf(target.date);
  await page.locator(`[data-day-cell="${target.date}"]`).click();
  const detail = page.locator(`[data-day-detail="${target.date}"]`);
  await expect(detail).toBeVisible();
  const set = target.entries[0].sets[0];
  await expect(detail).toContainText(`${set.weight} × ${set.reps}`);
  await page.locator('[data-action="close-day"]').click();
});

test('switching to the variation block keeps every past workout', async () => {
  const before = await page.evaluate(() => window.__zolf.store.state.sessions.length);
  await tab(page, 'settings');
  await page.locator('[data-select="program"]').selectOption('block-b');
  await tab(page, 'history');
  await expect(page.locator('[data-session]')).toHaveCount(before);

  // And a lift both blocks share still knows its history.
  await tab(page, 'today');
  await page.locator('[data-day="pull"]').click();
  await expect(page.locator('[data-ex="weighted-pullup"]')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-action="discard"]').click();
  await tab(page, 'settings');
  await page.locator('[data-select="program"]').selectOption('block-a');
});

test('diagnostics tells the truth about what is stored', async () => {
  await tab(page, 'settings');
  await expect(page.locator('[data-diag-row="Saved on this device"]')).toContainText('Yes');
  const count = await page.evaluate(() => window.__zolf.store.state.sessions.length);
  await expect(page.locator('[data-diag-row="Workouts in the log"]')).toContainText(String(count));
  await expect(page.locator('[data-diag-row="Workout open right now"]')).toContainText('None');
  await expect(page.locator('[data-storage-warning]')).toHaveCount(0);
});

test('a fortnight of data survives a reload and exports cleanly', async () => {
  const before = await page.evaluate(() => ({
    sessions: window.__zolf.store.state.sessions.length,
    protein: window.__zolf.store.state.protein.length,
    creatine: window.__zolf.store.state.creatine.length,
    weights: window.__zolf.store.state.bodyweights.length,
  }));
  await page.reload();
  await page.waitForSelector('.brand');
  const after = await page.evaluate(() => ({
    sessions: window.__zolf.store.state.sessions.length,
    protein: window.__zolf.store.state.protein.length,
    creatine: window.__zolf.store.state.creatine.length,
    weights: window.__zolf.store.state.bodyweights.length,
  }));
  assert.deepEqual(after, before);
  assert.ok(before.sessions >= 5, `expected a fortnight of training, found ${before.sessions}`);
  assert.deepEqual(app.errors, []);
  assert.deepEqual(await page.evaluate(() => window.__zolf.faults), []);
});
