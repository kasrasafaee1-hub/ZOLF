# ZOLF Lift

A workout and body-composition tracker built around one specific plan: a 4-day
split, a lean bulk from 16.5% body fat, and an InBody scan every few months.

Themed as a temple at night — gilt on deep aegean dark, inscriptional capitals
(Cinzel) for headings, Barlow for data. Each training day carries a patron
whose domain matches the work: Atlas bears the load, Zeus presses, Herakles
pulls, Ares takes the arms.

No accounts, no backend, no network. It is a static page that stores everything
in the browser on your phone and works offline once opened.

## Running it

```bash
npm install     # only needed for the tests
npm run serve   # http://localhost:4173
```

On a phone, open that URL over your local network and use **Add to Home Screen**.
It installs as a standalone app with an offline cache, so it opens in a gym
basement with no signal.

## What it does

**Today** — pick one of the four days, log weight/reps/RPE per set. Ticking a
set fills in the suggested target and starts the rest timer. The next day in the
rotation is flagged so you do not have to remember where you are.

**Progression** — double progression. Hit the top of the rep range on every set
and it tells you to add weight (10 lb on lower-body compounds, 5 lb on
everything else). Fall under the bottom and it backs the weight off. Otherwise
it holds the weight and asks for one more rep on your worst set.

**Log** — a month calendar with trained days in gold and rest days outlined,
plus sessions this month, current week streak, and days since the last session.
Under it, every session and set with estimated 1RM per exercise.

**Progress** — weekly hard sets per muscle against hypertrophy landmarks, in two
views: what your program prescribes, and what you actually completed in the last
7 days. Plus estimated-1RM charts per lift and tonnage per session.

**Body** — log bodyweight and InBody scans. From your weight and body fat it
computes lean mass, BMR (Katch-McArdle, the same formula InBody prints),
maintenance calories, and a calorie/macro target for your current phase. It
fits a trend line through your weigh-ins and tells you when you are gaining too
fast, too slow, or have hit your body-fat ceiling and should switch to a cut.

**Settings** — swap programs, activity level, rest length, body-fat ceiling, and
export/import your whole log as JSON.

## Programs

- **My Split (4 day)** — Legs+Core / Back+Triceps / Chest+Delts+Biceps /
  Arms+Core. The split as requested.
- **Balanced 4 day** — Lower A / Upper Push / Lower B / Upper Pull. Trains legs
  twice a week and cuts direct arm work down to a normal amount.

The Progress screen shows why the second one exists: as prescribed, the first
split runs 19 weekly sets of biceps and triceps against 7 for quads and 3 for
glutes. Both are shipped; the app flags the imbalance rather than hiding it.

## Testing

```bash
npm test             # everything below
npm run test:unit    # pure logic, no browser
npm run test:e2e     # drives the real app in Chromium
npm run test:bundle  # the same suite against the single-file published build
```

`tests/e2e/synced-app.test.js` runs the app with a stand-in for the `db`
capability, which is how it runs when published. That configuration is not the
default one, and a bug that only appears there — a sync tick stealing focus
from the field being typed into — is exactly what it exists to catch.

The end-to-end suite drives `playwright-core` from `node:test` rather than using
Playwright's own runner, which cannot launch a browser in some containers. It
starts a static server on an ephemeral port, so nothing has to be running first.

## Layout

```
index.html          app shell
src/core/           pure logic, no DOM — programs, training math, nutrition,
                    calendar, storage, sync
src/ui/             rendering and DOM helpers
scripts/server.js   static server, shared by `npm run serve` and the tests
public/             manifest, icon, service worker
tests/unit/         node:test over src/core
tests/e2e/          node:test + playwright-core over the real page
```

Your data lives in `localStorage` on one device and is never uploaded. Export
from Settings now and then — clearing your browser data deletes your log.
