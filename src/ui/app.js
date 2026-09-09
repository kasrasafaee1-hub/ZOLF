import { $, $$, el, fmtDate, fmtDateLong, mmss, lineChart } from './dom.js';
import { Store, today } from '../core/store.js';
import { getProgram, PROGRAMS, plannedWeeklyVolume } from '../core/programs.js';
import {
  estimated1RM,
  sessionVolume,
  sessionHardSets,
  bestSet,
  suggestNext,
  exercisePR,
  isNewPR,
  e1rmSeries,
  volumeByMuscle,
  volumeAudit,
  buildExerciseIndex,
} from '../core/training.js';
import { Syncer } from '../core/sync.js';
import {
  macroTargets,
  weeklyRate,
  bulkCheck,
  bodyFatBand,
  ACTIVITY,
  PHASES,
} from '../core/nutrition.js';

const store = new Store(window.localStorage);
const ui = { tab: 'today', openExercise: null, openedFor: null, chartExercise: null, volumeMode: null };
let syncer = null;

// Expose for end-to-end tests to seed and inspect state.
window.__zolf = { store, render: () => render() };

// ---------------------------------------------------------------- rest timer
const rest = { endsAt: 0, tick: null };

function startRest(seconds) {
  rest.endsAt = Date.now() + seconds * 1000;
  $('#rest-bar').hidden = false;
  if (!rest.tick) rest.tick = setInterval(paintRest, 250);
  paintRest();
}

function stopRest() {
  rest.endsAt = 0;
  clearInterval(rest.tick);
  rest.tick = null;
  $('#rest-bar').hidden = true;
}

function paintRest() {
  const left = (rest.endsAt - Date.now()) / 1000;
  $('#rest-time').textContent = mmss(left);
  if (left <= 0) {
    $('#rest-label').textContent = 'Go';
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    stopRest();
    toast('Rest done — next set.');
  } else {
    $('#rest-label').textContent = 'Rest';
  }
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.hidden = true;
  }, 2600);
}

// ------------------------------------------------------------------- helpers
const program = () => getProgram(store.state.settings.programId);
const exIndex = () => buildExerciseIndex(program());
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

function statCard(k, v, u = '') {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'k', text: k }),
    el('div', { class: 'v' }, [String(v), u ? el('span', { class: 'u', text: ' ' + u }) : null]),
  ]);
}

function emptyState(icon, title, body) {
  return el('div', { class: 'empty' }, [
    el('div', { class: 'big', text: icon }),
    el('div', { html: `<strong>${title}</strong>` }),
    el('p', { class: 'small', text: body }),
  ]);
}

// ------------------------------------------------------------------ TODAY tab
function viewToday() {
  return store.state.active ? viewActiveWorkout() : viewDayPicker();
}

function viewDayPicker() {
  const p = program();
  const wrap = el('div');
  wrap.append(el('h1', { text: 'Pick today’s session' }));
  wrap.append(el('p', { class: 'sub', text: `${p.name} — ${p.note}` }));

  const last = [...store.state.sessions].sort((a, b) => b.date.localeCompare(a.date))[0];
  const nextIdx = last ? (p.days.findIndex((d) => d.id === last.dayId) + 1) % p.days.length : 0;

  p.days.forEach((day, i) => {
    const prev = [...store.state.sessions].reverse().find((s) => s.dayId === day.id);
    const suggested = i === nextIdx;
    wrap.append(
      el(
        'button',
        {
          class: 'card day-card',
          'data-day': day.id,
          onclick: () => {
            store.startSession(day);
            render();
          },
        },
        [
          el('span', { class: 'n', text: String(i + 1) }),
          el('span', { class: 'body' }, [
            el('span', { class: 't', text: day.name }),
            el('br'),
            el('span', {
              class: 's',
              text: `${day.exercises.length} exercises · ${prev ? 'last ' + fmtDate(prev.date) : 'not logged yet'}`,
            }),
          ]),
          suggested ? el('span', { class: 'pill pr', text: 'NEXT' }) : el('span', { class: 'muted', text: '›' }),
        ]
      )
    );
  });

  const recent = [...store.state.sessions].slice(-3).reverse();
  if (recent.length) {
    wrap.append(el('h2', { text: 'Recent' }));
    for (const s of recent) {
      wrap.append(
        el('div', { class: 'card tight' }, [
          el('div', { class: 'spread' }, [
            el('div', {}, [
              el('strong', { text: s.dayName || s.dayId }),
              el('div', { class: 'small muted', text: fmtDateLong(s.date) }),
            ]),
            el('div', { class: 'small muted mono', text: `${sessionHardSets(s)} sets · ${sessionVolume(s).toLocaleString()} lb` }),
          ]),
        ])
      );
    }
  }
  return wrap;
}

function viewActiveWorkout() {
  const a = store.state.active;
  // A reload loses the in-memory accordion state. Reopen wherever the work is,
  // but only once per session so a deliberate collapse stays collapsed.
  if (ui.openedFor !== a.id) {
    ui.openedFor = a.id;
    const next = a.entries.find((e) => e.sets.some((s) => !s.done)) || a.entries[0];
    ui.openExercise = next?.exerciseId ?? null;
  }
  const idx = exIndex();
  const wrap = el('div');

  const totalSets = a.entries.reduce((n, e) => n + e.sets.length, 0);
  const doneSets = a.entries.reduce((n, e) => n + e.sets.filter((s) => s.done && Number(s.reps) > 0).length, 0);

  wrap.append(el('h1', { text: a.dayName }));
  wrap.append(el('p', { class: 'sub', text: `${fmtDateLong(a.date)} · ${doneSets}/${totalSets} sets logged` }));

  for (const entry of a.entries) {
    const exercise = idx[entry.exerciseId] || { repRange: entry.targetReps || [8, 12] };
    const open = ui.openExercise === entry.exerciseId;
    const doneCount = entry.sets.filter((s) => s.done && Number(s.reps) > 0).length;
    const complete = doneCount >= entry.sets.length;

    const box = el('div', { class: `ex${complete ? ' done' : ''}`, 'data-ex': entry.exerciseId });
    box.append(
      el(
        'button',
        {
          class: 'ex-head',
          type: 'button',
          'data-toggle': entry.exerciseId,
          onclick: () => {
            ui.openExercise = open ? null : entry.exerciseId;
            render();
          },
        },
        [
          el('span', { class: 't' }, [
            el('span', { class: 'n', text: entry.name }),
            el('br'),
            el('span', {
              class: 'm',
              text: `${entry.muscle} · ${exercise.repRange[0]}-${exercise.repRange[1]} reps`,
            }),
          ]),
          el('span', { class: 'count', text: `${doneCount}/${entry.sets.length}` }),
          el('span', { class: 'muted', text: open ? '▾' : '▸' }),
        ]
      )
    );

    if (open) box.append(exerciseBody(entry, exercise));
    wrap.append(box);
  }

  wrap.append(
    el('div', { class: 'field mt' }, [
      el('label', { text: 'Session note' }),
      el('textarea', {
        rows: 2,
        placeholder: 'Sleep, energy, aches, anything worth remembering…',
        'data-note': '1',
        onchange: (e) => store.updateActive((s) => ({ ...s, note: e.target.value })),
      }),
    ])
  );
  $$('[data-note]', wrap).forEach((t) => (t.value = a.note || ''));

  wrap.append(
    el('div', { class: 'row mt' }, [
      el('button', {
        class: 'btn primary block',
        'data-action': 'finish',
        text: 'Finish workout',
        onclick: finishWorkout,
      }),
    ])
  );
  wrap.append(
    el('button', {
      class: 'btn ghost danger block mt',
      'data-action': 'discard',
      text: 'Discard',
      onclick: () => {
        if (confirm('Throw this workout away?')) {
          store.discardSession();
          stopRest();
          render();
        }
      },
    })
  );
  return wrap;
}

function exerciseBody(entry, exercise) {
  const body = el('div', { class: 'ex-body' });
  const prev = store.lastEntryFor(entry.exerciseId, store.state.active.id);
  const tip = suggestNext(prev?.entry, exercise);

  if (prev) {
    const summary = prev.entry.sets.map((s) => `${s.weight || 'BW'}×${s.reps}`).join('  ');
    body.append(el('div', { class: 'prev', text: `Last (${fmtDate(prev.session.date)}): ${summary}` }));
  }
  body.append(
    el('div', { class: 'hint', 'data-hint': '1' }, [
      el('strong', { text: tip.weight != null ? `Target ${tip.weight} lb × ${tip.reps}. ` : 'Target: ' }),
      tip.reason,
    ])
  );

  body.append(
    el('div', { class: 'setlabels' }, [
      el('span', { text: '#' }),
      el('span', { text: 'lb' }),
      el('span', { text: 'reps' }),
      el('span', { text: 'rpe' }),
      el('span', { text: '✓' }),
      el('span', { text: '' }),
    ])
  );

  entry.sets.forEach((set, i) => {
    const row = el('div', { class: 'setrow', 'data-set': i });
    row.append(el('span', { class: 'idx', text: String(i + 1) }));

    const weight = el('input', {
      type: 'number',
      inputmode: 'decimal',
      step: '0.5',
      placeholder: tip.weight != null ? String(tip.weight) : '—',
      value: set.weight ?? '',
      'data-field': 'weight',
      'aria-label': `Set ${i + 1} weight`,
      oninput: (e) => store.setSet(entry.exerciseId, i, { weight: e.target.value }),
    });
    const reps = el('input', {
      type: 'number',
      inputmode: 'numeric',
      placeholder: String(tip.reps),
      value: set.reps ?? '',
      'data-field': 'reps',
      'aria-label': `Set ${i + 1} reps`,
      oninput: (e) => store.setSet(entry.exerciseId, i, { reps: e.target.value }),
    });
    const rpe = el('input', {
      type: 'number',
      inputmode: 'decimal',
      step: '0.5',
      placeholder: '–',
      value: set.rpe ?? '',
      'data-field': 'rpe',
      'aria-label': `Set ${i + 1} RPE`,
      oninput: (e) => store.setSet(entry.exerciseId, i, { rpe: e.target.value }),
    });
    const tick = el('button', {
      class: 'tick',
      type: 'button',
      'data-field': 'done',
      'aria-pressed': String(!!set.done),
      'aria-label': `Complete set ${i + 1}`,
      text: '✓',
      onclick: () => {
        const cur = store.state.active.entries.find((e) => e.exerciseId === entry.exerciseId).sets[i];
        const nextDone = !cur.done;
        const patch = { done: nextDone };
        // Filling in the suggestion on tap is what makes this fast at the rack.
        if (nextDone) {
          if (cur.weight === '' && tip.weight != null) patch.weight = tip.weight;
          if (cur.reps === '') patch.reps = tip.reps;
        }
        store.setSet(entry.exerciseId, i, patch);
        if (nextDone) startRest(store.state.settings.restSeconds);
        render();
      },
    });
    const kill = el('button', {
      class: 'kill',
      type: 'button',
      'data-field': 'remove',
      'aria-label': `Remove set ${i + 1}`,
      text: '×',
      onclick: () => {
        store.removeSet(entry.exerciseId, i);
        render();
      },
    });

    row.append(weight, reps, rpe, tick, kill);
    body.append(row);
  });

  body.append(
    el('button', {
      class: 'btn sm ghost',
      type: 'button',
      'data-action': 'add-set',
      text: '+ Add set',
      onclick: () => {
        store.addSet(entry.exerciseId);
        render();
      },
    })
  );

  const pr = exercisePR(store.state.sessions, entry.exerciseId);
  if (pr) {
    body.append(
      el('div', {
        class: 'small muted mt',
        text: `PR: ${pr.weight} lb × ${pr.reps} (${pr.e1rm} lb est. 1RM, ${fmtDate(pr.date)})`,
      })
    );
  }
  return body;
}

function finishWorkout() {
  const active = store.state.active;
  if (!active) return;
  const prs = active.entries
    .filter((e) => e.sets.some((s) => s.done && Number(s.reps) > 0))
    .filter((e) => isNewPR(store.state.sessions, active, e.exerciseId));
  const done = store.finishSession();
  stopRest();
  ui.openExercise = null;
  render();
  if (!done) toast('Nothing logged — session discarded.');
  else if (prs.length) toast(`Done. ${prs.length} new PR${prs.length > 1 ? 's' : ''}: ${prs.map((p) => p.name).join(', ')}`);
  else toast(`Done. ${sessionHardSets(done)} sets, ${sessionVolume(done).toLocaleString()} lb moved.`);
}

// ---------------------------------------------------------------- HISTORY tab
function viewHistory() {
  const wrap = el('div');
  wrap.append(el('h1', { text: 'History' }));
  const sessions = [...store.state.sessions].reverse();
  if (!sessions.length) {
    wrap.append(emptyState('≡', 'No workouts yet', 'Log your first session on the Today tab and it will show up here.'));
    return wrap;
  }
  wrap.append(el('p', { class: 'sub', text: `${sessions.length} sessions logged` }));

  for (const s of sessions) {
    const card = el('div', { class: 'card', 'data-session': s.id });
    card.append(
      el('div', { class: 'card-head' }, [
        el('h3', { text: s.dayName || s.dayId }),
        el('span', { class: 'meta', text: fmtDateLong(s.date) }),
      ])
    );
    card.append(
      el('div', { class: 'small muted mono', text: `${sessionHardSets(s)} sets · ${sessionVolume(s).toLocaleString()} lb total` })
    );

    const table = el('table');
    table.append(
      el('thead', {}, [
        el('tr', {}, [
          el('th', { text: 'Exercise' }),
          el('th', { class: 'num', text: 'Sets' }),
          el('th', { class: 'num', text: 'Best' }),
        ]),
      ])
    );
    const tbody = el('tbody');
    for (const entry of s.entries) {
      const b = bestSet(entry);
      tbody.append(
        el('tr', {}, [
          el('td', { text: entry.name }),
          el('td', { class: 'num', text: entry.sets.map((x) => `${x.weight || 'BW'}×${x.reps}`).join(', ') }),
          el('td', { class: 'num mono', text: b ? `${b.e1rm}` : '–' }),
        ])
      );
    }
    table.append(tbody);
    card.append(table);
    if (s.note) card.append(el('p', { class: 'small muted mt', text: `“${s.note}”` }));
    card.append(
      el('button', {
        class: 'btn sm ghost danger mt',
        'data-action': 'delete-session',
        text: 'Delete',
        onclick: () => {
          if (confirm('Delete this session?')) {
            store.deleteSession(s.id);
            render();
          }
        },
      })
    );
    wrap.append(card);
  }
  return wrap;
}

// --------------------------------------------------------------- PROGRESS tab
function viewProgress() {
  const wrap = el('div');
  wrap.append(el('h1', { text: 'Progress' }));

  const idx = exIndex();
  const trained = [...new Set(store.state.sessions.flatMap((s) => s.entries.map((e) => e.exerciseId)))];

  // --- weekly volume audit ---
  const vol = volumeByMuscle(store.state.sessions, idx, 7);
  const sessionsThisWeek = store.state.sessions.filter(
    (s) => s.date >= new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  ).length;
  // Judging a part-finished week against weekly targets just prints LOW on
  // everything, so default to the program plan until a full rotation is in.
  if (ui.volumeMode == null) ui.volumeMode = sessionsThisWeek >= 4 ? 'actual' : 'planned';
  const planned = ui.volumeMode === 'planned';

  wrap.append(el('h2', { text: 'Weekly volume' }));
  const modes = el('div', { class: 'row', 'data-volume-modes': '1' });
  for (const [mode, label] of [['planned', 'Program plan'], ['actual', 'Last 7 days']]) {
    modes.append(
      el('button', {
        class: `chip${ui.volumeMode === mode ? ' on' : ''}`,
        'data-volume-mode': mode,
        text: label,
        onclick: () => {
          ui.volumeMode = mode;
          render();
        },
      })
    );
  }
  wrap.append(modes);
  wrap.append(
    el('p', {
      class: 'sub mt',
      text: planned
        ? 'Hard sets per week your program prescribes, if you run all four days.'
        : `Hard sets you actually completed in the last 7 days (${sessionsThisWeek} session${sessionsThisWeek === 1 ? '' : 's'}).`,
    })
  );
  const source = planned ? plannedWeeklyVolume(store.state.settings.programId) : vol;
  const audit = volumeAudit(source);
  const volCard = el('div', { class: 'card', 'data-volume': '1' });
  for (const row of audit) {
    const pct = Math.min(100, (row.sets / row.max) * 100);
    volCard.append(
      el('div', { class: 'mt', 'data-muscle': row.muscle }, [
        el('div', { class: 'spread' }, [
          el('strong', { class: 'small', text: row.muscle }),
          el('span', { class: `pill ${row.status}`, text: row.status === 'ok' ? 'IN RANGE' : row.status.toUpperCase() }),
        ]),
        el('div', { class: `bar ${row.status}` }, [el('i', { style: `width:${pct}%` })]),
        el('div', { class: 'small muted', text: row.note }),
      ])
    );
  }
  wrap.append(volCard);

  // --- per-exercise strength ---
  wrap.append(el('h2', { text: 'Strength' }));
  if (!trained.length) {
    wrap.append(emptyState('◤', 'No lifts logged yet', 'Estimated 1RM charts appear once you have logged an exercise at least twice.'));
  } else {
    if (!ui.chartExercise || !trained.includes(ui.chartExercise)) ui.chartExercise = trained[0];
    const select = el('select', {
      'data-select': 'exercise',
      onchange: (e) => {
        ui.chartExercise = e.target.value;
        render();
      },
    });
    for (const id of trained) {
      const name = idx[id]?.name || store.state.sessions.flatMap((s) => s.entries).find((e) => e.exerciseId === id)?.name || id;
      select.append(el('option', { value: id, selected: id === ui.chartExercise, text: name }));
    }
    wrap.append(el('div', { class: 'field' }, [el('label', { text: 'Exercise' }), select]));

    const series = e1rmSeries(store.state.sessions, ui.chartExercise);
    const card = el('div', { class: 'card', 'data-chart': 'e1rm' });
    card.append(el('div', { class: 'small muted', text: 'Estimated 1RM (lb)' }));
    card.append(lineChart(series, { unit: ' lb' }));
    const first = series[0];
    const last = series[series.length - 1];
    if (first && last && series.length > 1) {
      const delta = Math.round((last.value - first.value) * 10) / 10;
      card.append(
        el('div', {
          class: 'small mt',
          text: `${delta >= 0 ? '+' : ''}${delta} lb since ${fmtDate(first.date)} (${series.length} sessions)`,
        })
      );
    }
    wrap.append(card);

    const pr = exercisePR(store.state.sessions, ui.chartExercise);
    if (pr) {
      wrap.append(
        el('div', { class: 'grid three' }, [
          statCard('PR weight', pr.weight, 'lb'),
          statCard('PR reps', pr.reps),
          statCard('Est. 1RM', pr.e1rm, 'lb'),
        ])
      );
    }
  }

  // --- tonnage per session ---
  if (store.state.sessions.length > 1) {
    wrap.append(el('h2', { text: 'Total tonnage per session' }));
    const card = el('div', { class: 'card', 'data-chart': 'tonnage' });
    card.append(lineChart(store.state.sessions.map((s) => ({ date: s.date, value: sessionVolume(s) })), { unit: ' lb' }));
    wrap.append(card);
  }
  return wrap;
}

// ------------------------------------------------------------------- BODY tab
function viewBody() {
  const wrap = el('div');
  const s = store.state;
  wrap.append(el('h1', { text: 'Body & nutrition' }));

  const latest = store.latestMetric();
  const latestBw = s.bodyweights[s.bodyweights.length - 1];
  const weightLb = latestBw?.weight ?? latest?.weight ?? null;
  const bodyFatPct = latest?.bodyFatPct ?? null;

  if (weightLb == null || bodyFatPct == null) {
    wrap.append(
      el('div', { class: 'banner warn' }, [
        el('b', { text: 'Add your InBody numbers' }),
        'Enter weight and body fat % below and this screen turns into your calorie and macro plan.',
      ])
    );
  } else {
    const t = macroTargets({
      weightLb,
      bodyFatPct,
      activityId: s.settings.activityId,
      phaseId: s.settings.phaseId,
    });
    const rate = weeklyRate(s.bodyweights);
    const check = bulkCheck({
      rateLbPerWeek: rate,
      bodyFatPct,
      ceilingPct: s.settings.bodyFatCeiling,
      phaseId: s.settings.phaseId,
    });

    wrap.append(
      el('div', { class: `banner ${check.status}`, 'data-banner': 'phase' }, [
        el('b', { text: `${PHASES[s.settings.phaseId].label} — ${check.status === 'ok' ? 'on track' : check.status === 'warn' ? 'adjust' : 'stop the bulk'}` }),
        el('ul', {}, check.messages.map((m) => el('li', { text: m }))),
      ])
    );

    wrap.append(el('h2', { text: 'Daily targets' }));
    wrap.append(
      el('div', { class: 'grid two', 'data-targets': '1' }, [
        statCard('Calories', t.calories.toLocaleString(), 'kcal'),
        statCard('Protein', t.protein, 'g'),
        statCard('Carbs', t.carbs, 'g'),
        statCard('Fat', t.fat, 'g'),
      ])
    );
    wrap.append(
      el('div', { class: 'card tight mt small muted' }, [
        `BMR ${t.bmr.toLocaleString()} kcal · maintenance ≈ ${t.maintenance.toLocaleString()} kcal · lean mass ${t.lbm} lb · fat mass ${t.fatMass} lb`,
      ])
    );

    const band = bodyFatBand(bodyFatPct);
    if (band) wrap.append(el('p', { class: 'small muted mt', text: `${bodyFatPct}% body fat — ${band.label}` }));

    const phaseRow = el('div', { class: 'row mt' });
    for (const p of Object.values(PHASES)) {
      phaseRow.append(
        el('button', {
          class: `chip${s.settings.phaseId === p.id ? ' on' : ''}`,
          'data-phase': p.id,
          text: p.label,
          onclick: () => {
            store.setSetting('phaseId', p.id);
            render();
          },
        })
      );
    }
    wrap.append(el('h2', { text: 'Phase' }), phaseRow);
  }

  // --- bodyweight logging ---
  wrap.append(el('h2', { text: 'Bodyweight' }));
  const bwCard = el('div', { class: 'card' });
  const bwInput = el('input', { type: 'number', step: '0.1', inputmode: 'decimal', placeholder: 'lb', 'data-input': 'bodyweight' });
  bwCard.append(
    el('div', { class: 'row' }, [
      el('div', { style: 'flex:1' }, [bwInput]),
      el('button', {
        class: 'btn primary',
        'data-action': 'log-bodyweight',
        text: 'Log',
        onclick: () => {
          const v = num(bwInput.value);
          if (!Number.isFinite(v) || v <= 0) return toast('Enter a weight first.');
          store.addBodyweight(v);
          toast(`Logged ${v} lb.`);
          render();
        },
      }),
    ])
  );
  if (s.bodyweights.length) {
    bwCard.append(lineChart(s.bodyweights.map((b) => ({ date: b.date, value: b.weight })), { unit: ' lb' }));
    const rate = weeklyRate(s.bodyweights);
    if (rate != null) {
      bwCard.append(
        el('div', { class: 'small muted mt', 'data-rate': '1', text: `Trend: ${rate > 0 ? '+' : ''}${rate} lb/week over ${s.bodyweights.length} weigh-ins` })
      );
    } else {
      bwCard.append(el('div', { class: 'small muted mt', text: 'Log another day to get a trend.' }));
    }
  }
  wrap.append(bwCard);

  // --- InBody entry ---
  wrap.append(el('h2', { text: 'InBody scan' }));
  const form = el('div', { class: 'card', 'data-form': 'metric' });
  const fields = [
    ['weight', 'Weight (lb)', '179.7'],
    ['bodyFatPct', 'Body fat %', '16.5'],
    ['smm', 'Skeletal muscle mass (lb)', '85.3'],
    ['bodyFatMass', 'Body fat mass (lb)', '29.8'],
  ];
  const inputs = {};
  const grid = el('div', { class: 'grid two' });
  for (const [key, label, ph] of fields) {
    inputs[key] = el('input', { type: 'number', step: '0.1', inputmode: 'decimal', placeholder: ph, 'data-metric': key });
    grid.append(el('div', { class: 'field' }, [el('label', { text: label }), inputs[key]]));
  }
  form.append(grid);
  form.append(
    el('button', {
      class: 'btn primary block',
      'data-action': 'save-metric',
      text: 'Save scan',
      onclick: () => {
        const weight = num(inputs.weight.value);
        const bf = num(inputs.bodyFatPct.value);
        if (!Number.isFinite(weight) || !Number.isFinite(bf)) return toast('Weight and body fat % are required.');
        store.addMetric({
          weight,
          bodyFatPct: bf,
          smm: Number.isFinite(num(inputs.smm.value)) ? num(inputs.smm.value) : null,
          bodyFatMass: Number.isFinite(num(inputs.bodyFatMass.value)) ? num(inputs.bodyFatMass.value) : null,
        });
        store.addBodyweight(weight);
        toast('Scan saved.');
        render();
      },
    })
  );
  wrap.append(form);

  if (s.metrics.length) {
    wrap.append(el('h2', { text: 'Scan history' }));
    const card = el('div', { class: 'card' });
    const table = el('table');
    table.append(
      el('thead', {}, [
        el('tr', {}, [
          el('th', { text: 'Date' }),
          el('th', { class: 'num', text: 'Weight' }),
          el('th', { class: 'num', text: 'BF%' }),
          el('th', { class: 'num', text: 'SMM' }),
          el('th', {}),
        ]),
      ])
    );
    const tbody = el('tbody');
    for (const m of [...s.metrics].reverse()) {
      tbody.append(
        el('tr', { 'data-metric-row': m.id }, [
          el('td', { text: fmtDate(m.date) }),
          el('td', { class: 'num mono', text: m.weight ?? '–' }),
          el('td', { class: 'num mono', text: m.bodyFatPct ?? '–' }),
          el('td', { class: 'num mono', text: m.smm ?? '–' }),
          el('td', { class: 'num' }, [
            el('button', {
              class: 'btn sm ghost danger',
              text: '×',
              'aria-label': 'Delete scan',
              onclick: () => {
                store.deleteMetric(m.id);
                render();
              },
            }),
          ]),
        ])
      );
    }
    table.append(tbody);
    card.append(table);
    if (s.metrics.length > 1) {
      card.append(el('div', { class: 'small muted mt', text: 'Skeletal muscle mass' }));
      card.append(lineChart(s.metrics.filter((m) => m.smm).map((m) => ({ date: m.date, value: m.smm })), { unit: ' lb' }));
      card.append(el('div', { class: 'small muted mt', text: 'Body fat %' }));
      card.append(lineChart(s.metrics.filter((m) => m.bodyFatPct).map((m) => ({ date: m.date, value: m.bodyFatPct })), { unit: '%' }));
    }
    wrap.append(card);
  }
  return wrap;
}

/**
 * Hand the log to the viewer as a file.
 *
 * A plain <a download> is inert inside the artifact viewer, so when the
 * downloads capability is present the save goes through it. The anchor is kept
 * for the version served from a plain web server, where it is the only option.
 */
async function exportBackup() {
  const filename = `zolf-lift-${today()}.json`;
  const json = store.exportJSON();

  if (typeof window.claude?.use === 'function') {
    let downloads = null;
    try {
      downloads = await window.claude.use('downloads');
    } catch {
      downloads = null;
    }
    if (downloads) {
      try {
        await downloads.save({ filename, data: json });
        toast('Exported.');
      } catch (err) {
        // `declined` is the viewer saying no; never retry, never fall through
        // to an anchor that would silently do nothing.
        toast(err?.code === 'declined' ? 'Export cancelled.' : 'Could not export here.');
      }
      return;
    }
  }

  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Exported.');
}

// --------------------------------------------------------------- SETTINGS tab
function viewSettings() {
  const wrap = el('div');
  const s = store.state.settings;
  wrap.append(el('h1', { text: 'Settings' }));

  wrap.append(el('h2', { text: 'Program' }));
  const progSelect = el('select', {
    'data-select': 'program',
    onchange: (e) => {
      if (store.state.active && !confirm('Switching programs ends the workout in progress. Continue?')) {
        return render();
      }
      if (store.state.active) store.discardSession();
      store.setSetting('programId', e.target.value);
      render();
    },
  });
  for (const p of Object.values(PROGRAMS)) {
    progSelect.append(el('option', { value: p.id, selected: p.id === s.programId, text: p.name }));
  }
  wrap.append(el('div', { class: 'card' }, [progSelect, el('p', { class: 'small muted mt', text: getProgram(s.programId).note })]));

  wrap.append(el('h2', { text: 'Activity level' }));
  const actSelect = el('select', {
    'data-select': 'activity',
    onchange: (e) => {
      store.setSetting('activityId', e.target.value);
      render();
    },
  });
  for (const a of Object.values(ACTIVITY)) {
    actSelect.append(el('option', { value: a.id, selected: a.id === s.activityId, text: a.label }));
  }
  wrap.append(el('div', { class: 'card' }, [actSelect]));

  wrap.append(el('h2', { text: 'Rest timer' }));
  const restSelect = el('select', {
    'data-select': 'rest',
    onchange: (e) => {
      store.setSetting('restSeconds', Number(e.target.value));
      render();
    },
  });
  for (const v of [60, 90, 120, 150, 180, 240]) {
    restSelect.append(el('option', { value: v, selected: v === s.restSeconds, text: mmss(v) }));
  }
  wrap.append(el('div', { class: 'card' }, [restSelect]));

  wrap.append(el('h2', { text: 'Body fat ceiling' }));
  const ceil = el('input', {
    type: 'number',
    step: '0.5',
    value: s.bodyFatCeiling,
    'data-input': 'ceiling',
    onchange: (e) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v) && v > 5 && v < 40) store.setSetting('bodyFatCeiling', v);
      render();
    },
  });
  wrap.append(
    el('div', { class: 'card' }, [
      ceil,
      el('p', { class: 'small muted mt', text: 'The app tells you to stop bulking once your scan hits this. Past ~20% the surplus buys mostly fat.' }),
    ])
  );

  wrap.append(el('h2', { text: 'Backup' }));
  const backup = el('div', { class: 'card' });
  backup.append(
    el('button', {
      class: 'btn block',
      'data-action': 'export',
      text: 'Export data (JSON)',
      onclick: () => exportBackup(),
    })
  );
  const file = el('input', { type: 'file', accept: 'application/json', 'data-input': 'import', style: 'display:none' });
  file.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      store.importJSON(await f.text());
      toast('Imported.');
      render();
    } catch {
      toast('That file is not a valid backup.');
    }
  });
  backup.append(file);
  backup.append(
    el('button', { class: 'btn block mt', 'data-action': 'import', text: 'Import backup', onclick: () => file.click() })
  );
  backup.append(
    el('button', {
      class: 'btn ghost danger block mt',
      'data-action': 'reset',
      text: 'Erase all data',
      onclick: () => {
        if (confirm('Erase every workout, scan and setting? This cannot be undone.')) {
          store.reset();
          stopRest();
          render();
          toast('Wiped.');
        }
      },
    })
  );
  wrap.append(backup);

  wrap.append(
    el('p', {
      class: 'small muted mt',
      text: 'Everything lives on this device only — nothing is uploaded. Export now and then so a cleared browser does not cost you your log.',
    })
  );
  return wrap;
}

// ---------------------------------------------------------------------- sync
const SYNC_LABELS = {
  offline: { dot: '○', title: 'This device only — not synced' },
  syncing: { dot: '◐', title: 'Syncing…' },
  synced: { dot: '●', title: 'Synced — your log is backed up' },
  error: { dot: '⚠', title: 'Sync failed — your log is still safe on this device' },
};

function syncStatusNode() {
  const status = syncer?.status || 'offline';
  const { dot, title } = SYNC_LABELS[status] || SYNC_LABELS.offline;
  return el('span', {
    class: `sync sync-${status}`,
    'data-sync': status,
    title,
    'aria-label': title,
    text: dot,
  });
}

/**
 * Mirrors the log into the artifact db when the page is served with that
 * capability. Everything keeps working without it, on localStorage alone.
 */
async function startSync() {
  if (typeof window.claude?.use !== 'function') return;
  try {
    const db = await window.claude.use('db');
    if (!db) return;
    // Re-render on status changes and on data arriving from another device.
    // Never on local writes: that would recreate the input being typed into.
    syncer = new Syncer(store, { db, onStatus: () => render(), onRemoteChange: () => render() });
    await syncer.start();
    render();
  } catch {
    /* the app is fully usable without sync */
  }
}

// ------------------------------------------------------------------- renderer
const VIEWS = { today: viewToday, history: viewHistory, progress: viewProgress, body: viewBody, settings: viewSettings };

function render() {
  const view = $('#view');
  view.replaceChildren(VIEWS[ui.tab]());
  for (const tab of $$('.tab')) tab.setAttribute('aria-selected', String(tab.dataset.tab === ui.tab));

  const right = $('#topbar-right');
  const a = store.state.active;
  right.replaceChildren(
    syncStatusNode(),
    a
      ? el('span', { class: 'pill pr', text: 'IN PROGRESS' })
      : el('span', { text: `${store.state.sessions.length} sessions` })
  );
}

function boot() {
  for (const tab of $$('.tab')) {
    tab.addEventListener('click', () => {
      ui.tab = tab.dataset.tab;
      render();
    });
  }
  $('#rest-add').addEventListener('click', () => {
    rest.endsAt += 30000;
    paintRest();
  });
  $('#rest-skip').addEventListener('click', stopRest);
  render();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./public/sw.js').catch(() => {});
  }

  startSync();
}

boot();
