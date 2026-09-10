import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, expect, tab } from './harness.js';

// Drives the app the way a person does — random weights and reps, across every
// day of the split, reloading between sessions — and checks that every number
// comes back on the right date. Runs with sync live, which is how it ships.
const FAKE_HOST = () => {
  const KEY = '__soak_server';
  const read = () => {
    try {
      return JSON.parse(sessionStorage.getItem(KEY) || 'null');
    } catch {
      return null;
    }
  };
  const watchers = [];
  window.claude = {
    use: async (name) =>
      name !== 'db'
        ? null
        : {
            doc: () => ({
              // Deliberately the Firestore-ish shape: the payload sits behind
              // a data() method, which is what broke the unwrapping before.
              async get() {
                const doc = read();
                return doc ? { exists: true, data: () => doc } : { exists: false };
              },
              async set(value) {
                sessionStorage.setItem(KEY, JSON.stringify(value));
                for (const fn of watchers) setTimeout(() => fn({ exists: true, data: () => read() }), 0);
              },
              onSnapshot(fn) {
                watchers.push(fn);
                return () => watchers.splice(watchers.indexOf(fn), 1);
              },
            }),
          },
  };
};

let app;
let page;

// A fixed seed keeps a failure reproducible instead of "it went red once".
let seed = 20260910;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

const iso = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** The first exercise renders already expanded, so toggle only when needed. */
const setExerciseOpen = async (exId, open) => {
  const isOpen = (await page.locator(`[data-ex="${exId}"] .ex-body`).count()) > 0;
  if (isOpen !== open) await page.locator(`[data-toggle="${exId}"]`).click();
};

before(async () => {
  app = await launch();
  page = app.page;
  await page.addInitScript(FAKE_HOST);
  await app.reset();
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  await page.reload();
  await page.waitForSelector('[data-day="legs-core"]');
});
after(async () => app?.close());

test('twelve sessions of random numbers all survive, date by date', async () => {
  const DAYS = ['legs-core', 'back-triceps', 'chest-delts-biceps', 'arms-core'];
  const expected = [];

  for (let i = 0; i < 12; i++) {
    const dayId = DAYS[i % 4];
    const date = iso(11 - i);

    await tab(page, 'today');
    await page.locator(`[data-day="${dayId}"]`).click();

    // Backdate the session the way a real log spreads over weeks.
    await page.evaluate((d) => {
      window.__zolf.store.updateActive((a) => ({ ...a, date: d }));
      window.__zolf.render();
    }, date);

    // Log the first three exercises with random, plausible numbers.
    const exIds = await page.locator('.ex').evaluateAll((els) => els.slice(0, 3).map((e) => e.dataset.ex));
    const logged = [];
    for (const exId of exIds) {
      await setExerciseOpen(exId, true);
      const setCount = Math.min(3, await page.locator(`[data-ex="${exId}"] .setrow`).count());
      assert.ok(setCount > 0, `${exId} rendered no set rows to log into`);
      const sets = [];
      for (let sIdx = 0; sIdx < setCount; sIdx++) {
        const weight = pick(45, 315);
        const reps = pick(3, 15);
        const row = page.locator(`[data-ex="${exId}"] [data-set="${sIdx}"]`);
        await row.locator('[data-field="weight"]').fill(String(weight));
        await row.locator('[data-field="reps"]').fill(String(reps));
        await row.locator('[data-field="done"]').click();
        sets.push({ weight, reps });
      }
      logged.push({ exId, sets });
      await setExerciseOpen(exId, false);
    }

    await page.locator('[data-action="finish"]').click();
    await expect(page.getByRole('heading', { name: /Pick today/ })).toBeVisible();
    expected.push({ date, dayId, logged });

    // Let sync settle, then reload — the numbers must come back off disk.
    await page.waitForTimeout(1100);
    await page.reload();
    await page.waitForSelector('.brand');
  }

  // Every session is present, on the right date, with the right count.
  const stored = await page.evaluate(() =>
    window.__zolf.store.state.sessions.map((s) => ({
      date: s.date,
      dayId: s.dayId,
      entries: s.entries.map((e) => ({ id: e.exerciseId, sets: e.sets.map((x) => ({ weight: x.weight, reps: x.reps })) })),
    }))
  );
  assert.equal(stored.length, 12, `expected 12 sessions, found ${stored.length}`);

  for (const want of expected) {
    const got = stored.find((s) => s.date === want.date);
    assert.ok(got, `nothing stored for ${want.date}`);
    assert.equal(got.dayId, want.dayId);
    for (const ex of want.logged) {
      const entry = got.entries.find((e) => e.id === ex.exId);
      assert.ok(entry, `${ex.exId} missing on ${want.date}`);
      assert.equal(entry.sets.length, ex.sets.length, `${ex.exId} on ${want.date} lost sets`);
      entry.sets.forEach((set, i) => {
        assert.equal(Number(set.weight), ex.sets[i].weight, `${ex.exId} set ${i + 1} weight on ${want.date}`);
        assert.equal(Number(set.reps), ex.sets[i].reps, `${ex.exId} set ${i + 1} reps on ${want.date}`);
      });
    }
  }
});

test('every logged date is gold on the calendar', async () => {
  await tab(page, 'history');
  const dates = await page.evaluate(() => [...new Set(window.__zolf.store.state.sessions.map((s) => s.date))]);
  assert.ok(dates.length >= 10, `expected a full log, found ${dates.length} dates`);

  const now = new Date();
  for (const date of dates) {
    const [y, m] = date.split('-').map(Number);
    // Step exactly to that month, then step back, so the view is where the
    // next date expects to find it.
    const back = (now.getFullYear() * 12 + now.getMonth()) - (y * 12 + (m - 1));
    for (let i = 0; i < back; i++) await page.locator('[data-cal="prev"]').click();
    const cell = page.locator(`[data-day-cell="${date}"]`);
    assert.equal(await cell.count(), 1, `${date} has no cell on the calendar`);
    await expect(cell).toHaveAttribute('data-trained', 'true');
    for (let i = 0; i < back; i++) await page.locator('[data-cal="next"]').click();
  }
});

test('opening a date shows every number logged that day', async () => {
  await tab(page, 'history');
  const target = await page.evaluate(() => {
    const s = window.__zolf.store.state.sessions;
    return s[s.length - 1];
  });

  await page.locator(`[data-day-cell="${target.date}"]`).click();
  const detail = page.locator(`[data-day-detail="${target.date}"]`);
  await expect(detail).toBeVisible();

  for (const entry of target.entries) {
    await expect(detail.locator(`[data-detail-ex="${entry.exerciseId}"]`)).toBeVisible();
    for (const set of entry.sets) {
      await expect(detail).toContainText(`${set.weight} × ${set.reps}`);
    }
  }
  await page.locator('[data-action="close-day"]').click();
  await expect(detail).toHaveCount(0);
});

test('a rest day opens and says so instead of showing nothing', async () => {
  await tab(page, 'history');
  const restDate = await page.evaluate(() => {
    const trained = new Set(window.__zolf.store.state.sessions.map((s) => s.date));
    const cells = [...document.querySelectorAll('[data-day-cell]')].map((c) => c.dataset.dayCell);
    return cells.find((d) => !trained.has(d));
  });
  await page.locator(`[data-day-cell="${restDate}"]`).click();
  await expect(page.locator(`[data-day-detail="${restDate}"] [data-day-empty]`)).toContainText('Rest day');
});

test('the history list carries the same numbers as the calendar detail', async () => {
  await tab(page, 'history');
  const sessions = await page.evaluate(() => window.__zolf.store.state.sessions);
  await expect(page.locator('[data-session]')).toHaveCount(sessions.length);
  const newest = sessions[sessions.length - 1];
  const first = newest.entries[0];
  await expect(page.locator(`[data-session="${newest.id}"]`)).toContainText(first.name);
  await expect(page.locator(`[data-session="${newest.id}"]`)).toContainText(
    `${first.sets[0].weight}×${first.sets[0].reps}`
  );
});

test('the whole log survives a wipe of local storage, restored from the server', async () => {
  const before = await page.evaluate(() => window.__zolf.store.state.sessions.length);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.brand');
  await page.waitForTimeout(1400);
  const after = await page.evaluate(() => window.__zolf.store.state.sessions.length);
  assert.equal(after, before, 'sessions did not come back from the server');
  assert.deepEqual(app.errors, []);
});
