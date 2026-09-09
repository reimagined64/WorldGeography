/**
 * U16 — the four screens, the dispatcher, and the end of the transition.
 *
 * Three kinds of claim live here. The first is structural and is checked by
 * reading the tree: the monolith is gone, and nothing writes a global any more.
 *
 * The second is the reason `revealToken` is in the shared store rather than
 * private to `flight.ts`. A twelve-second reveal hands four callbacks to the
 * globe and outlives the render that made them; leaving the game or starting a
 * new one has to invalidate them, and the token is the only thing that can say
 * so once the player is back on a game screen with the same question on it. The
 * two cancellation tests below fire a stale callback by hand — which a real
 * globe never does, because `cancelFlight` drops it first — so that the token is
 * the only guard standing between the callback and the screen. Delete
 * `token !== store.revealToken` from any of the three and they fail.
 *
 * The third is that the screens still play: real saves resume, both game modes
 * reach the results screen, the keyboard still answers, and the debug API
 * reports the same phases through all of it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Core from '../../src/engine/core.ts';
import type { GameState } from '../../src/engine/types.ts';
import { installDebugApi, store } from '../../src/app/state.ts';
import { STORE, loadRun } from '../../src/app/storage.ts';
import { handleKeydown, renderView, rerender } from '../../src/app/main.ts';
import { choose, nextQuestion } from '../../src/app/views/game.ts';
import { startGame } from '../../src/app/views/home.ts';
import { BASELINE_ROOT } from '../helpers/load-baseline.ts';
import {
  StubElement, flightProgress, installApp, type CapturedFlight, type Harness,
} from '../helpers/app-harness.ts';

const SRC_ROOT = fileURLToPath(new URL('../../src', import.meta.url));

let app: Harness;

beforeEach(() => { app = installApp(); });
afterEach(() => { app.restore(); });

/* ------------------------------------------------------------------ *
 * Playing, without a browser
 * ------------------------------------------------------------------ */

/** The reveal the globe is flying right now. */
function liveFlight(): CapturedFlight {
  const flight = app.globe.flights.at(-1);
  if (flight === undefined) throw new Error('no reveal has been started');
  return flight;
}

/** Land the arrival, if one is in the air, and let the clock start. */
async function reachQuestion(): Promise<void> {
  if (store.phase === 'flying') liveFlight().onComplete();
  await app.settleClockStart();
}

/** Answer wrongly and move on. Correct answers buy attempts and never end. */
async function playWrong(): Promise<void> {
  await reachQuestion();
  const game = store.game!;
  const q = game.questions[game.index]!;
  choose((q.correct + 1) % 3);
  nextQuestion();
}

/** Every question the run put on screen, as the header named its player. */
async function playToResults(): Promise<{ players: number[]; headers: string[] }> {
  const players: number[] = [];
  const headers: string[] = [];
  for (let guard = 0; guard < 200 && store.view === 'game'; guard += 1) {
    await reachQuestion();
    const game = store.game!;
    const q = game.questions[game.index]!;
    players.push(q.player);
    headers.push(/Na tahu: ([^<]+)</.exec(app.el('side-panel').innerHTML)?.[1] ?? '');
    await playWrong();
  }
  if (store.view !== 'results') throw new Error(`the run never finished; stopped on ${store.view}`);
  return { players, headers };
}

/* ------------------------------------------------------------------ *
 * The transition is over
 * ------------------------------------------------------------------ */

function sourceFiles(dir: string, into: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, into);
    else if (/\.(?:ts|js)$/.test(entry.name)) into.push(path);
  }
  return into;
}

/** An assignment to a property of `window`, which is what the shim did. */
const GLOBAL_WRITE = /\bwindow\s*(?:\.[A-Za-z_$][\w$]*|\[[^\]\n]+\])\s*=(?!=)/g;

describe('the transition is over', () => {
  it('has no monolith and no shim left to import', () => {
    expect(existsSync(join(SRC_ROOT, 'app/app.js'))).toBe(false);
    expect(existsSync(join(SRC_ROOT, 'legacy-globals.ts'))).toBe(false);
    // And nothing else slipped in behind them: the tree is TypeScript now.
    expect(sourceFiles(SRC_ROOT).filter((file) => file.endsWith('.js'))).toEqual([]);
  });

  it('writes no global at all, the debug API included', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC_ROOT)) {
      for (const match of readFileSync(file, 'utf8').matchAll(GLOBAL_WRITE)) {
        offenders.push(`${file.slice(SRC_ROOT.length + 1)}: ${match[0]}`);
      }
    }
    // `installDebugApi` takes the target as an argument and `boot` passes
    // `window` to it, so even `window.WorldGeography` is not written here.
    expect(offenders).toEqual([]);

    // The scanner is not vacuous: these are the five names the shim published.
    const shim = "legacy['GeoCore'] = core;\nwindow.GeoAudio = GeoAudio;\nwindow['GeoApp'] = {};";
    expect([...shim.matchAll(GLOBAL_WRITE)].map((m) => m[0])).toEqual(['window.GeoAudio =', "window['GeoApp'] ="]);
  });
});

/* ------------------------------------------------------------------ *
 * The dispatcher
 * ------------------------------------------------------------------ */

describe('the view dispatcher', () => {
  it('renders the screen it is given and leaves the others as they were', () => {
    renderView('home');
    expect(store.view).toBe('home');
    expect(app.el('side-panel').innerHTML).toContain('Zahájit expedici');
    const untouched = app.el('results-view').innerHTML;

    renderView('atlas');
    expect(store.view).toBe('atlas');
    expect(app.el('world-heading').innerHTML).toContain('OTEVŘENÝ ATLAS');
    expect(app.el('side-panel').innerHTML).toContain('Atlas světa');
    expect(app.el('side-panel').innerHTML).not.toContain('Zahájit expedici');
    expect(app.el('results-view').innerHTML).toBe(untouched);
    expect(app.el('main-view').hidden).toBe(false);
  });

  it('leaves the main view alone when it renders the results section', () => {
    renderView('home');
    const home = app.el('side-panel').innerHTML;
    store.game = Core.makeGame(app.countries, { players: 1, names: ['Tester', 'Hráč 2'], difficulty: 'normal', region: 'all' }, 20260916);

    renderView('results');
    expect(store.view).toBe('results');
    expect(app.el('results-view').innerHTML).toContain('CELKEM BODŮ');
    expect(app.el('side-panel').innerHTML).toBe(home);
    expect(app.el('main-view').hidden).toBe(true);
    expect(app.el('results-view').hidden).toBe(false);
  });

  it('re-renders whatever is on screen without being told which that is', () => {
    renderView('atlas');
    app.el('side-panel').innerHTML = '';

    rerender();
    expect(app.el('side-panel').innerHTML).toContain('Atlas světa');
  });
});

/* ------------------------------------------------------------------ *
 * Stale reveals
 * ------------------------------------------------------------------ */

describe('a reveal that is no longer the current one', () => {
  it('does nothing after the player left the game and came back to it', () => {
    startGame();
    expect(store.phase).toBe('flying');
    const abandoned = liveFlight();
    const game = store.game!;

    // "Uložit a odejít", then "Expedice" again. The run, the question and the
    // screen are all the same as when the abandoned reveal was started, so
    // `view !== 'game'` and the question identity check both pass it through.
    renderView('home');
    expect(store.phase).toBe('idle');
    renderView('game');
    expect(store.phase).toBe('flying');
    const current = liveFlight();
    expect(current).not.toBe(abandoned);
    expect(store.game!.questions[store.game!.index]).toBe(game.questions[game.index]);

    const countdown = app.el('rest-seconds').textContent;
    const status = app.el('flight-status').textContent;
    const cues = app.audio.cues.length;

    abandoned.onComplete();
    abandoned.onStage('zoom');
    abandoned.onProgress(flightProgress({ stage: 'zoom', remainingMs: 400, progress: 0.97 }));

    expect(store.phase).toBe('flying');
    expect(game.revealedIndex).toBeNull();
    expect(store.flightKey).toBe(`${game.created}:${game.index}`);
    expect(app.el('rest-seconds').textContent).toBe(countdown);
    expect(app.el('flight-status').textContent).toBe(status);
    expect(app.audio.cues).toHaveLength(cues);
    expect(app.el('side-panel').innerHTML).toContain('ODDECH PŘED');

    // The same callbacks on the live reveal do land, so the assertions above
    // are about the token and not about a callback that was never wired.
    current.onProgress(flightProgress({ stage: 'zoom', remainingMs: 400, progress: 0.97 }));
    expect(app.el('rest-seconds').textContent).not.toBe(countdown);
    current.onComplete();
    expect(store.phase).toBe('question');
    expect(store.game!.revealedIndex).toBe(store.game!.index);
  });

  it('does nothing after a new run replaced the one it belonged to', () => {
    startGame();
    const first = liveFlight();
    const abandonedGame = store.game!;

    startGame();
    const second = liveFlight();
    const currentGame = store.game!;
    expect(currentGame).not.toBe(abandonedGame);
    expect(store.phase).toBe('flying');

    const countdown = app.el('rest-seconds').textContent;
    const status = app.el('flight-status').textContent;
    const detail = app.el('rest-detail').textContent;
    const cues = [...app.audio.cues];

    first.onProgress(flightProgress({ stage: 'settle', remainingMs: 1500, progress: 0.88, turnsCompleted: 3 }));
    first.onStage('zoom');
    first.onComplete();

    expect(store.game).toBe(currentGame);
    expect(currentGame.revealedIndex).toBeNull();
    expect(store.phase).toBe('flying');
    expect(store.flightKey).toBe(`${currentGame.created}:${currentGame.index}`);
    expect(app.el('rest-seconds').textContent).toBe(countdown);
    expect(app.el('flight-status').textContent).toBe(status);
    expect(app.el('rest-detail').textContent).toBe(detail);
    expect(app.audio.cues).toEqual(cues);

    second.onProgress(flightProgress({ stage: 'settle', remainingMs: 1500, progress: 0.88, turnsCompleted: 3 }));
    expect(app.el('flight-status').textContent).toContain('ZAMĚŘENÍ');
    expect(app.el('rest-detail').textContent).toContain('3 / 3');
  });
});

/* ------------------------------------------------------------------ *
 * Saves written before the split
 * ------------------------------------------------------------------ */

describe('a run saved before the views were split out', () => {
  const runs = readdirSync(join(BASELINE_ROOT, 'runs')).filter((name) => name.endsWith('.json'));

  it('has fixtures to answer with', () => {
    expect(runs.length).toBeGreaterThan(0);
  });

  it.each(runs)('resumes %s onto the screen it stopped on', (name) => {
    const raw = readFileSync(join(BASELINE_ROOT, 'runs', name), 'utf8');
    const saved = JSON.parse(raw) as GameState;
    app.storage.set(STORE.run, raw);

    const game = loadRun(app.countries, app.byCode);
    expect(game).not.toBeNull();
    expect(game!.questions).toEqual(saved.questions);
    expect(game!.answers).toEqual(saved.answers);
    expect(game!.scores).toEqual(saved.scores);
    expect(game!.lives).toEqual(saved.lives);

    store.game = game;
    renderView('game');

    expect(store.view).toBe('game');
    expect(store.game!.index).toBe(saved.index);
    const q = saved.questions[saved.index]!;
    expect(app.el('side-panel').innerHTML).toContain(`Na tahu: ${saved.options.names[q.player]}`);
    if (saved.answers[saved.index]) {
      // The save was taken while the player was reading the feedback.
      expect(store.phase).toBe('feedback');
    } else if (saved.revealedIndex === saved.index) {
      // A stored clock always comes back paused, so a resumed question opens on
      // the pause card rather than counting down at a player who is not there.
      expect(store.phase).toBe(saved.clock ? 'paused' : 'question');
    } else {
      expect(store.phase).toBe('flying');
      expect(app.el('side-panel').innerHTML).toContain('ODDECH PŘED');
    }
  });

  it('plays a resumed save on to the results screen', async () => {
    const raw = readFileSync(join(BASELINE_ROOT, 'runs', 'mid-country.json'), 'utf8');
    app.storage.set(STORE.run, raw);
    store.game = loadRun(app.countries, app.byCode);
    renderView('game');

    // Paused by the resume, exactly as a returning player finds it.
    expect(store.phase).toBe('paused');
    store.game!.clock!.paused = false;
    renderView('game');

    const { players } = await playToResults();
    expect(players.length).toBeGreaterThan(0);
    expect(store.view).toBe('results');
    expect(app.el('results-view').innerHTML).toContain('CELKEM BODŮ');
  });
});

/* ------------------------------------------------------------------ *
 * Playing
 * ------------------------------------------------------------------ */

describe('a whole run', () => {
  it('reaches the results screen in single-player mode, with the debug API following it', async () => {
    const target: Record<string, unknown> = {};
    const api = installDebugApi(target);
    expect(target['WorldGeography']).toBe(api);

    renderView('home');
    expect(api.getView()).toBe('home');
    expect(api.getStatus().phase).toBe('idle');
    expect(api.getState()).toBeNull();

    startGame();
    expect(api.getView()).toBe('game');
    expect(api.getStatus().phase).toBe('flying');
    expect(api.getStatus().clock).toBeNull();

    liveFlight().onComplete();
    expect(api.getStatus().phase).toBe('question');
    await app.settleClockStart();
    expect(api.getStatus().clock?.running).toBe(true);
    expect(api.getStatus().clock?.index).toBe(0);

    const q = store.game!.questions[0]!;
    choose((q.correct + 1) % 3);
    expect(api.getStatus().phase).toBe('feedback');
    expect(api.getState()?.answers[0]?.correct).toBe(false);
    nextQuestion();

    const { players } = await playToResults();
    expect(new Set(players)).toEqual(new Set([0]));
    expect(api.getView()).toBe('results');
    expect(api.getStatus().phase).toBe('idle');
    expect(api.getState()?.gameOver).toBe(true);
    expect(app.el('results-view').innerHTML).toContain('Pokusy došly. Svět zůstává.');
    // The run is over, so the resumable slot is emptied and the record written.
    expect(app.storage.get(STORE.run)).toBe('null');
    expect(app.storage.has(STORE.record)).toBe(true);
  });

  it('alternates the two players of a duel and reaches their results', async () => {
    store.options.players = 2;
    store.options.names = ['Alice', 'Bob'];
    startGame();

    const { players, headers } = await playToResults();

    // The panel names whoever the engine says is on turn, every single time.
    expect(headers).toEqual(players.map((player) => (player === 0 ? 'Alice' : 'Bob')));
    // A country is five questions and never changes hands in the middle of one.
    const changes = players.filter((player, i) => i > 0 && player !== players[i - 1]).length;
    expect(changes).toBeGreaterThan(1);
    for (let i = 0; i < players.length; i += 1) {
      const q = store.game!.questions[i]!;
      if (q.type !== 'flag' && i > 0 && players[i] !== players[i - 1]) expect(q.type).toBe('country');
    }
    expect(new Set(players)).toEqual(new Set([0, 1]));

    expect(store.view).toBe('results');
    expect(app.el('results-view').innerHTML).toContain('Alice');
    expect(app.el('results-view').innerHTML).toContain('Bob');
    expect(app.el('results-view').innerHTML).toContain('duel-result');
    expect(store.game!.gameOver).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * The keyboard
 * ------------------------------------------------------------------ */

/** A keydown as the handler reads it: no bubbling, no defaults, no element. */
function press(key: string, target: { tagName: string } | null = null): void {
  handleKeydown({ key, repeat: false, ctrlKey: false, metaKey: false, altKey: false, target, preventDefault: () => {} } as unknown as KeyboardEvent);
}

describe('the keyboard', () => {
  const answerButtons = (): StubElement[] => [0, 1, 2].map((i) => {
    const button = new StubElement(`answer-${i}`);
    button.dataset['answer'] = String(i);
    return button;
  });

  it('moves the highlight through the answers and submits the one it lands on', async () => {
    startGame();
    await reachQuestion();
    const buttons = answerButtons();
    app.register('[data-answer]', buttons);
    expect(store.selected).toBe(0);

    press('ArrowDown');
    expect(store.selected).toBe(1);
    press('ArrowRight');
    expect(store.selected).toBe(2);
    press('ArrowDown');
    expect(store.selected).toBe(0);
    press('ArrowUp');
    expect(store.selected).toBe(2);
    press('ArrowLeft');
    expect(store.selected).toBe(1);

    expect(buttons.map((b) => b.classList.contains('key-selected'))).toEqual([false, true, false]);
    expect(app.audio.cues.filter((cue) => cue === 'select')).toHaveLength(5);

    press('Enter');
    expect(store.phase).toBe('feedback');
    expect(store.game!.answers[0]?.selected).toBe(1);
  });

  it('answers directly on 1-3 and A-C', async () => {
    startGame();
    await reachQuestion();

    press('c');
    expect(store.phase).toBe('feedback');
    expect(store.game!.answers[0]?.selected).toBe(2);

    // Enter on the feedback screen is "next", not another answer.
    press('Enter');
    expect(store.phase).not.toBe('feedback');
    expect(store.game!.index).toBe(1);
  });

  it('keeps its hands off a form field and a closed game', async () => {
    startGame();
    await reachQuestion();

    press('2', { tagName: 'INPUT' });
    expect(store.phase).toBe('question');

    store.view = 'atlas';
    press('2');
    expect(store.phase).toBe('question');
    expect(store.game!.answers[0]).toBeUndefined();
  });
});
