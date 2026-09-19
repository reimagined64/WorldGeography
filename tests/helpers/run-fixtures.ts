/**
 * The saved runs the browser suite resumes, built by the engine that will read
 * them back.
 *
 * `browser.test.py` built these inside the page, by reaching for the `GeoCore`
 * global v7 published and driving it through `submit`/`advance` until the run
 * was in the state a scenario needed. U16 deleted that global — the bundle
 * keeps its engine inside its own closure — so the same walk happens here, in
 * Node, and the result is written into `localStorage` before the page loads.
 *
 * Which is the stronger arrangement anyway. `isValidRun` replays every stored
 * answer and re-derives the ledger, so a payload invented by hand is rejected
 * before the game sees it; a payload the engine produced is accepted because it
 * is real. And building it out here means each fixture is a *named* state with
 * its ledger asserted at build time, instead of a count of `True`s in a list
 * whose meaning is a comment.
 *
 * Two things had to change from v7's numbers, and both are recorded rather than
 * worked around:
 *
 *   * The runs are parameterised by locale. A run bakes its prompts at creation
 *     (KTD13), so an English scenario needs an English run; `lang` is what
 *     `loadRun` reads to decide whether the save and the shell agree.
 *   * The outcome counts are derived, not copied. v7's comments say "12 correct
 *     answers is 9,360 points"; that is a fact about the *v7 dataset*, and U9
 *     moved the data. `playUntil` below drives the engine until the ledger
 *     reaches the state the scenario is named for, so the fixtures stay
 *     meaningful across a data refresh instead of silently becoming a different
 *     scenario with the same name.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../scripts/build.ts';
import * as Core from '../../src/engine/core.ts';
import { csQuestions } from '../../src/i18n/questions.cs.ts';
import { enQuestions } from '../../src/i18n/questions.en.ts';
import type { GameState, Locale, LocalizedCountry, QuestionBundle } from '../../src/engine/types.ts';

/** The dataset the game ships, which is the one the page will validate against. */
const countries = JSON.parse(
  readFileSync(join(REPO_ROOT, 'data/build/countries.json'), 'utf8'),
) as LocalizedCountry[];

export const byCode: Readonly<Record<string, LocalizedCountry>> =
  Object.fromEntries(countries.map((c) => [c.code, c]));

export const BUNDLES: Readonly<Record<Locale, QuestionBundle>> = Object.freeze({
  cs: csQuestions,
  en: enQuestions,
});

/** v7's seed, kept so a failure here and a failure there name the same countries. */
const SEED = 37501;

/** The two player names v7's fixtures used, in both languages. */
const NAMES = ['Anna', 'Petr'];

/** How long a question is held before it is answered, in the fixtures that score. */
const ELAPSED_MS = 5000;

export interface RunOptions {
  readonly lang?: Locale;
  readonly players?: number;
  readonly elapsedMs?: number;
  /**
   * Freeze the run on a question the player has already arrived at.
   *
   * A save with `revealedIndex` set is what the game writes *after* an arrival
   * flight, so resuming one puts the question straight on screen. Every
   * scenario that is not itself about the flight uses it: twelve seconds of
   * virtual time is about seven seconds of real time, and paying that to reach
   * a question the test was not asking about is the difference between a suite
   * that runs in CI and one that times out there.
   */
  readonly revealed?: boolean;
}

function newRun(bundle: QuestionBundle, players: number): GameState {
  return {
    ...Core.makeGame(countries, { players, names: [...NAMES], difficulty: 'normal', region: 'all' }, bundle, SEED),
    lang: bundle.locale,
  };
}

/** Reveal the question the run stops on, and pause its clock there. */
function freeze(game: GameState, revealed: boolean, elapsedMs: number): GameState {
  if (revealed) {
    game.revealedIndex = game.index;
    game.clock = { index: game.index, elapsedMs, paused: true };
  }
  return game;
}

/**
 * Play until `stop` says the run is where the scenario wants it.
 *
 * `answer` decides each question; `stop` is consulted after the answer has been
 * scored and before the next question is appended, which is the only moment at
 * which "the run is one correct answer short of ten thousand points" is a
 * statement about the run rather than about the question after it.
 */
function playUntil(
  game: GameState,
  bundle: QuestionBundle,
  answer: (game: GameState) => boolean,
  stop: (game: GameState) => boolean,
  elapsedMs: number,
): GameState {
  for (let guard = 0; guard < 600; guard += 1) {
    const question = game.questions[game.index];
    if (question === undefined) break;
    Core.submit(game, answer(game) ? question.correct : (question.correct + 1) % 3, elapsedMs);
    if (stop(game)) return game;
    if (game.gameOver || !Core.advance(game, countries, bundle)) break;
  }
  throw new Error('the simulated run ended before it reached the state the fixture is named for');
}

const options = (o: RunOptions): { bundle: QuestionBundle; players: number; elapsedMs: number; revealed: boolean } => ({
  bundle: BUNDLES[o.lang ?? 'cs'],
  players: o.players ?? 1,
  elapsedMs: o.elapsedMs ?? ELAPSED_MS,
  revealed: o.revealed ?? true,
});

/**
 * The first question of a country the run can still afford.
 *
 * The entry cost has just been charged, so the attempts left are what the five
 * questions of this country will be measured against: they must not move again
 * until the *next* country is entered. Starting a run from the home screen
 * would reach the same state, twelve seconds of arrival flight later, and the
 * flight is not what this is about.
 */
export function startOfCountry(o: RunOptions = {}): GameState {
  const { bundle, players, elapsedMs, revealed } = options(o);
  const game = newRun(bundle, players);
  for (let guard = 0; guard < 600; guard += 1) {
    const question = game.questions[game.index];
    if (question === undefined) break;
    Core.submit(game, (question.correct + 1) % 3, elapsedMs);
    if (game.gameOver || !Core.advance(game, countries, bundle)) break;
    const next = game.questions[game.index];
    if (next?.type === 'country' && game.lives[0]! > 0) return freeze(game, revealed, elapsedMs);
  }
  throw new Error('the simulated run never reached a second country with attempts to spare');
}

/**
 * One correct answer short of the ten-thousand-point milestone.
 *
 * Stopped mid-country on purpose: the flag bonus the next answer earns has to
 * wait for the categories still owed on this one, and a run frozen on the last
 * of the five would have nothing left to defer through.
 */
export function beforeMilestone(o: RunOptions = {}): GameState {
  const { bundle, players, elapsedMs, revealed } = options(o);
  const game = playUntil(
    newRun(bundle, players),
    bundle,
    () => true,
    (g) => g.scores[0]! < Core.BONUS_INTERVAL
      && g.scores[0]! + Core.MAX_POINTS >= Core.BONUS_INTERVAL
      && g.questions[g.index]!.type !== 'population',
    elapsedMs,
  );
  Core.advance(game, countries, bundle);
  return freeze(game, revealed, elapsedMs);
}

/**
 * Stopped on the flag bonus itself: the free, neutral, unpriced question.
 *
 * Reached by playing on until `advance` hands back a flag turn rather than by
 * counting answers, because how many answers that takes is a fact about the
 * dataset's point values rather than about the rule being tested.
 */
export function onFlagBonus(o: RunOptions = {}): GameState {
  const { bundle, players, elapsedMs, revealed } = options(o);
  const game = newRun(bundle, players);
  for (let guard = 0; guard < 600; guard += 1) {
    const question = game.questions[game.index];
    if (question === undefined) break;
    Core.submit(game, question.correct, elapsedMs);
    if (game.gameOver || !Core.advance(game, countries, bundle)) break;
    if (game.questions[game.index]?.type === 'flag') return freeze(game, revealed, elapsedMs);
  }
  throw new Error('the simulated run never reached a flag bonus');
}

/**
 * The last country the run can pay for, at the first of its five questions.
 *
 * `lives[0] === 0` after the country was charged: the entry cost is prepaid, so
 * all five questions remain and none of them can cost anything more. Wrong
 * answers throughout, because a correct one scores and a scoring run never ends.
 */
export function lastAffordableCountry(o: RunOptions = {}): GameState {
  const { bundle, players, elapsedMs, revealed } = options(o);
  const game = newRun(bundle, players);
  for (let guard = 0; guard < 600; guard += 1) {
    const question = game.questions[game.index];
    if (question === undefined) break;
    Core.submit(game, (question.correct + 1) % 3, elapsedMs);
    if (game.gameOver || !Core.advance(game, countries, bundle)) break;
    const next = game.questions[game.index];
    if (next?.type === 'country' && game.lives[0] === 0) return freeze(game, revealed, elapsedMs);
  }
  throw new Error('the simulated run never reached its last affordable country');
}

/**
 * A two-player run stopped on the first player's flag bonus.
 *
 * The first player answers correctly and the second does not, so by the time
 * the fixture is read the two ledgers disagree about everything the rule keeps
 * personal — score, attempts, and whether a flag is owed at all. A duel in
 * which both players had the same ledger would pass the turn-taking assertion
 * without saying anything about ownership.
 *
 * Answered instantly, so the milestone lands on a round ten thousand rather
 * than somewhere past it: the scenario is about who the bonus belongs to, and
 * an exact threshold is easier to read in a failure than 10,140.
 */
export function duel(o: RunOptions = {}): GameState {
  const { bundle, elapsedMs, revealed } = options({ elapsedMs: 0, ...o });
  const game = playUntil(
    newRun(bundle, 2),
    bundle,
    (g) => g.questions[g.index]!.player === 0,
    (g) => g.pendingBonuses[0]!.length > 0,
    elapsedMs,
  );
  Core.advance(game, countries, bundle);
  return freeze(game, revealed, elapsedMs);
}
