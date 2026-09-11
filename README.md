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

**Log** — a month calendar with trained days filled and rest days outlined, plus
sessions this month, sessions in the last 7 days against the 4-day target, and
days since the last session. Tap any date for that day's full session. Under it,
every session and set with estimated 1RM per exercise.

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

## Two apps, one codebase

`src/core/profiles.js` holds everything that differs between people — wordmark,
tab names, the sex the body-composition maths is calibrated for, and which
programme set loads. `npm run build` emits one file per profile:

| Profile | App | Split |
|---|---|---|
| `zolf` | ZOLF Lift | Push Mon / Pull Tue / Legs Thu / Full Sat |
| `amore` | Amore's Splits | Push Tue / Quads Wed / Pull Thu / Glutes Fri |

Body fat is judged against sex-specific bands — 22% is athletic for a woman and
average for a man, so reading one against the other's scale gives bad advice —
and the bulk ceiling defaults accordingly (20% / 28%).

Adding a person is an entry in `profiles.js`, a programme set, and a palette in
`src/ui/tokens-<id>.css`. No fork.

## Programs

Two blocks per person, same days and muscle groups, different exercises. They
**rotate automatically every two weeks** from the day the app is first opened —
derived from the calendar, so both devices agree without syncing a flag and an
old session still tells you which block you were on. It can be turned off in
settings, which freezes whichever block is live rather than jumping.

- **Block A — current** — Push (Mon) / Pull (Tue) / Legs (Thu) / Full (Sat), the
  split as actually run.
- **Block B — variation** — the same four days and the same muscle groups with a
  different exercise selection, so the stimulus changes without the structure
  moving.

Every lift runs **2 sets of 6-8 reps**, by request: a short session where the
only thing to type at the rack is the weight. Reps arrive pre-filled from the
progression target; weight is deliberately left blank. A third set is one tap on
"Add set" and inherits the row above it. Timed holds keep seconds.

Each exercise carries its own rest, a role in the session (primary, volume,
isolation, finisher, health, core) and the coaching cue that matters for it, and
the rest timer uses the exercise's own rest rather than one global number.

Two sets a lift is a real volume cut — it puts most muscles under the range that
drives growth, calves worst at 2 weekly sets. The Trials screen reports that
plainly rather than presenting the programme as adequate.

## Testing

```bash
npm test             # everything below
npm run test:unit    # pure logic, no browser
npm run test:e2e     # drives the real app in Chromium
npm run test:bundle  # the same suite against the single-file published build
```

`tests/e2e/daily-use.test.js` plays two weeks of ordinary use in order on one
install — train the four days, eat, take creatine, weigh in, then do it again
the next week — and checks the app carried it all forward. It is the "is this
useful on a Tuesday" test rather than a feature-by-feature one.

`tests/e2e/blocked-storage.test.js` runs the app where localStorage throws, as
it does in a sandboxed iframe on iOS Safari.

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
