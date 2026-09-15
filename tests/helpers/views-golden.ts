/**
 * Every screen the shell renders, in Czech, as one comparable snapshot.
 *
 * U11 moves roughly two hundred Czech literals out of the views and into a
 * catalog, and the one claim that makes that safe is that the Czech a player
 * reads did not move with them. Asserting it string by string would be a
 * transcription of the diff; this renders the screens instead and compares the
 * markup, so a key that resolves to the wrong value, a template that lost an
 * interpolation, or a plural that changed category all fail the same way.
 *
 * The scenes are driven from the four committed v7 saves rather than from a
 * freshly seeded game, because they are real runs: one mid-country, one
 * mid-flight, one just past a bonus milestone and one with a flag bonus
 * pending. Between them they reach the life ledger, the bonus progress line,
 * the feedback block and the two-player header, which a single scripted game
 * would not.
 *
 * Shared by `scripts/capture-views.ts` and `tests/unit/i18n.test.ts` for the
 * same reason `golden.ts` is shared: a fixture written by one walk and checked
 * by another walk proves only that the two walks agree.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameState } from '../../src/engine/types.ts';
import { store } from '../../src/app/state.ts';
import { renderView } from '../../src/app/main.ts';
import { choose, pauseQuestion } from '../../src/app/views/game.ts';
import { showHelp } from '../../src/app/dialogs/help.ts';
import { showSources } from '../../src/app/dialogs/sources.ts';
import { renderMobileHud } from '../../src/app/mobile-hud.ts';
import { BASELINE_ROOT } from './load-baseline.ts';
import { flightProgress, type Harness } from './app-harness.ts';

/** The v7 saves, by the names `capture-golden.ts` wrote them under. */
export const SAVED_RUNS = ['mid-country', 'mid-flight', 'post-milestone', 'pending-bonus'] as const;

export const loadSavedRun = (name: string): GameState =>
  JSON.parse(readFileSync(join(BASELINE_ROOT, 'runs', `${name}.json`), 'utf8')) as GameState;

/** The elements a render writes into, plus the two it only sets attributes on. */
function page(app: Harness): Record<string, string> {
  const globe = app.el('globe');
  return {
    heading: app.el('world-heading').innerHTML,
    caption: app.el('world-caption').innerHTML,
    panel: app.el('side-panel').innerHTML,
    results: app.el('results-view').innerHTML,
    hud: app.el('mobile-hud').innerHTML,
    flightStatus: app.el('flight-status').textContent ?? '',
    globeLabel: globe.getAttribute('aria-label') ?? '',
  };
}

const scene = (into: Record<string, string>, name: string, app: Harness): void => {
  for (const [part, html] of Object.entries(page(app))) into[`${name}/${part}`] = html;
};

/**
 * Render every screen and hand back what each one printed.
 *
 * The caller owns the harness because installing it twice in one process would
 * leave two sets of globals behind; this only drives it.
 */
export async function captureViews(app: Harness): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  // The feedback block prints the answer's elapsed time, and `ensureClock`
  // builds its clock with the default `performance.now` reader, so a capture
  // that let real time pass would record a different number every run. Freezing
  // the reader makes every clock in the walk report exactly what the save
  // carried.
  const realNow = performance.now.bind(performance);
  performance.now = (): number => 0;
  try {
    return await walk(app, out);
  } finally {
    performance.now = realNow;
  }
}

async function walk(app: Harness, out: Record<string, string>): Promise<Record<string, string>> {

  store.game = null;
  store.record = null;
  store.options = { players: 1, names: ['Hráč 1', 'Hráč 2'], difficulty: 'normal', region: 'all', motion: 'full' };
  renderView('home');
  scene(out, 'home-solo', app);

  store.options = { players: 2, names: ['Ada', 'Grace'], difficulty: 'expert', region: 'Europe', motion: 'reduced' };
  store.record = { points: 12_500, total: 40, date: '2026-01-01T00:00:00.000Z' };
  renderView('home');
  scene(out, 'home-duel-record', app);

  // A run in progress puts a resume button on the setup screen, and that
  // button is where v7 printed the genitive plural flat: "1 pokusů".
  store.options = { players: 1, names: ['Hráč 1', 'Hráč 2'], difficulty: 'normal', region: 'all', motion: 'full' };
  store.record = null;
  store.game = loadSavedRun('mid-country');
  renderView('home');
  scene(out, 'home-resume-solo', app);

  const duelSave = loadSavedRun('mid-country');
  duelSave.options = { ...duelSave.options, players: 2, names: ['Ada', 'Grace'] };
  duelSave.lives = [4, 1];
  duelSave.scores = [1200, 800];
  store.game = duelSave;
  renderView('home');
  scene(out, 'home-resume-duel', app);

  const training = loadSavedRun('mid-country');
  training.review = true;
  store.game = training;
  renderView('home');
  scene(out, 'home-resume-review', app);

  store.game = null;
  renderView('atlas');
  scene(out, 'atlas', app);

  // The game screens, one per saved run, in each phase that run can be in.
  for (const name of SAVED_RUNS) {
    store.game = loadSavedRun(name);
    store.lastGlobeCode = null;
    store.clock = null;
    store.clockIndex = -1;
    store.phase = 'idle';
    renderView('game');
    // `startClockAfterPaint` waits on a promise and two frames; letting it
    // finish keeps its callbacks from firing into a torn-down page.
    await app.settleClockStart();
    scene(out, `game-${name}`, app);
    // `renderGame` decides the phase; the HUD only exists in one of them.
    if ((store.phase as string) === 'question') {
      renderMobileHud(undefined);
      out[`game-${name}/hud-live`] = app.el('mobile-hud').innerHTML;
    }
  }

  // The flight card talks in four stages and two motion modes, and none of it
  // is in the markup the render produced: the globe hands the strings back
  // through callbacks. Driving them is the only way they reach the fixture.
  store.options = { ...store.options, motion: 'full' };
  store.game = loadSavedRun('mid-flight');
  store.lastGlobeCode = null;
  store.phase = 'idle';
  renderView('game');
  await app.settleClockStart();
  out['flight/panel-full-motion'] = app.el('side-panel').innerHTML;
  const flight = app.globe.flights.at(-1);
  if (flight === undefined) throw new Error('the mid-flight save did not start a reveal');
  for (const stage of ['depart', 'spin', 'settle', 'zoom'] as const) {
    flight.onStage(stage);
    out[`flight/stage-${stage}`] =
      `${app.el('flight-title').textContent ?? ''} | ${app.el('flight-description').textContent ?? ''}`;
  }
  for (const [name, state] of [
    ['spinning', flightProgress({ stage: 'spin', turnsCompleted: 2 })],
    ['settling', flightProgress({ stage: 'settle' })],
    ['zooming', flightProgress({ stage: 'zoom' })],
    ['departing', flightProgress({ stage: 'depart' })],
    ['still', flightProgress({ motion: false })],
  ] as const) {
    flight.onProgress(state);
    out[`flight/progress-${name}`] =
      `${app.el('flight-status').textContent ?? ''} | ${app.el('rest-detail').textContent ?? ''}`;
  }

  // Feedback, in each of the three ways a question can end, and the pause card.
  for (const name of ['wrong', 'right', 'timeout'] as const) {
    const run = loadSavedRun('mid-country');
    // A timed-out question is reached by handing the render a clock that has
    // already run past the limit; `tickClock` then answers `null` by itself,
    // which is the path a real timeout takes.
    if (name === 'timeout') run.clock = { index: run.index, elapsedMs: 600_000, paused: false };
    store.game = run;
    store.lastGlobeCode = null;
    store.clock = null;
    store.clockIndex = -1;
    store.phase = 'idle';
    renderView('game');
    await app.settleClockStart();
    const question = run.questions[run.index]!;
    if (name !== 'timeout') choose(name === 'right' ? question.correct : (question.correct + 1) % 3);
    scene(out, `feedback-${name}`, app);
  }

  // The last answer of a finished run labels its button "results", not "next".
  const lastRun = loadSavedRun('mid-country');
  store.game = lastRun;
  store.lastGlobeCode = null;
  store.clock = null;
  store.clockIndex = -1;
  store.phase = 'idle';
  renderView('game');
  await app.settleClockStart();
  choose((lastRun.questions[lastRun.index]!.correct + 1) % 3);
  lastRun.gameOver = true;
  renderView('game');
  scene(out, 'feedback-game-over', app);

  store.game = loadSavedRun('mid-country');
  store.lastGlobeCode = null;
  store.clock = null;
  store.clockIndex = -1;
  store.phase = 'idle';
  renderView('game');
  await app.settleClockStart();
  pauseQuestion();
  scene(out, 'paused', app);

  // The results screen, from a run played to its end.
  const finished = loadSavedRun('mid-country');
  finished.completed = true;
  finished.gameOver = true;
  store.game = finished;
  store.record = null;
  renderView('results');
  scene(out, 'results', app);

  // …and the training half of it, which prints a different title, a different
  // stat column and the "no mistakes" branch.
  const review = loadSavedRun('mid-country');
  review.completed = true;
  review.review = true;
  store.game = review;
  renderView('results');
  scene(out, 'results-review', app);

  // A two-player run reaches a title and a duel block nothing else does.
  const duel = loadSavedRun('mid-country');
  duel.completed = true;
  duel.gameOver = true;
  duel.options = { ...duel.options, players: 2, names: ['Ada', 'Grace'] };
  duel.scores = [4200, 3100];
  duel.lives = [0, 0];
  duel.earnedLives = [2, 0];
  store.game = duel;
  renderView('results');
  scene(out, 'results-duel', app);

  const tie = { ...duel, scores: [4200, 4200] } as GameState;
  store.game = tie;
  renderView('results');
  scene(out, 'results-tie', app);

  // A run with a wrong answer in it: the mistake list, the "your answer" line
  // and the training button only exist on this branch.
  const missed = loadSavedRun('mid-country');
  missed.completed = true;
  missed.gameOver = true;
  const firstAnswer = missed.answers[0];
  if (firstAnswer !== undefined) {
    missed.answers[0] = { ...firstAnswer, correct: false, points: 0, bonusPoints: 0, selected: 0 };
    if (missed.questions[0] !== undefined) missed.questions[0] = { ...missed.questions[0], correct: 1 };
  }
  store.game = missed;
  renderView('results');
  scene(out, 'results-mistakes', app);

  // The two dialogs that are pure prose.
  showHelp((html) => { out['dialog/help'] = html; });
  const dialogContent = app.el('dialog-content');
  showSources();
  out['dialog/sources'] = dialogContent.innerHTML;

  return out;
}
