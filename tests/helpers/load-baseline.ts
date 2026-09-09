/**
 * Loader and type surface for the frozen v7 JavaScript in `tests/fixtures/baseline/js/`.
 *
 * `package.json` is `"type": "module"`, so `require()` is gone and
 * `createRequire` reads these files as ESM and dies on `module.exports`. The
 * plan called for a `node:vm` context; measured against this data set that
 * costs 19x — 14,040 `makeQuestion` calls take 22.8 s in a vm context and
 * 1.2 s in the host realm, because every property read of the host-realm
 * country array from vm-realm code crosses a context boundary. The suite runs
 * on every commit, so the sources are evaluated in the host realm with
 * `new Function` instead, whose parameters supply exactly the bindings each
 * wrapper expects: `module` for the two UMD files, `window` plus the handful of
 * browser globals for the two browser-only ones. Byte-for-byte the same source
 * text, and the emitted questions are identical either way (verified).
 *
 * The declared interfaces are narrow on purpose: they cover only the surface
 * the suites touch, so a mistyped field fails a typecheck rather than hiding
 * under `any`. U5 deletes this file together with the last baseline consumer.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASELINE_ROOT = fileURLToPath(new URL('../fixtures/baseline', import.meta.url));

export type Difficulty = 'easy' | 'normal' | 'expert';
export type QuestionType = 'country' | 'capital' | 'currency' | 'language' | 'population';
export type QuestionKind = QuestionType | 'flag';

export interface CurrencyName {
  code: string;
  name: string;
}

export interface Country {
  code: string;
  iso3: string;
  name: string;
  capital: string[];
  currency: string[];
  currencyNames: CurrencyName[];
  languages: string[];
  languageNames: string[];
  excludeLanguages: string[];
  lat: number;
  lon: number;
  region: string;
  population: number;
  populationYear: number;
  populationKind: string;
  populationSource: string;
  note: string;
  easy: boolean;
}

export interface GameOptions {
  players: number;
  difficulty: Difficulty;
  region: string;
  names: string[];
  mode?: string;
}

/** What `makeQuestion` returns; `appendQuestion` adds the placement fields. */
export interface BaseQuestion {
  country: string;
  type: QuestionKind;
  prompt: string;
  options: string[];
  correct: number;
  explanation: string;
  source: string;
}

export interface Question extends BaseQuestion {
  visit: number;
  player: number;
  anchor: string;
  bonusThreshold?: number;
  regularIndex?: number;
  livesBeforeCountry?: number;
  countryCost?: number;
}

/** The v7 shape. A `review` game omits the five ledger fields; nothing here plays one. */
export interface AnswerResult {
  selected: number | null;
  correct: boolean;
  points: number;
  basePoints: number;
  bonusPoints: number;
  elapsedMs: number;
  timeLimitMs: number;
  timedOut: boolean;
  player: number;
  lifeDelta: number;
  scoreLifeDelta: number;
  flagLifeDelta: number;
  milestoneThresholds: number[];
  livesBefore: number;
  livesAfter: number;
  isFlagBonus: boolean;
}

export interface Economy {
  scores: number[];
  lives: number[];
  earnedLives: number[];
  scoreLives: number[];
  flagLives: number[];
  bonusMilestones: number[];
  bonusIssued: number[];
  pendingBonuses: number[][];
  countriesPlayed: number[];
}

export interface ClockSnapshot {
  index: number;
  elapsedMs: number;
  paused: boolean;
}

export interface Game extends Economy {
  version: number;
  seed: number;
  revealedIndex: number | null;
  clock: ClockSnapshot | null;
  options: GameOptions;
  questions: Question[];
  index: number;
  answers: AnswerResult[];
  deck: string[];
  recentFlags: string[];
  cycles: number;
  created: string;
  completed: boolean;
  gameOver: boolean;
  lastCountry?: string;
  review?: boolean;
}

export type Turn =
  | { kind: 'end' }
  | { kind: 'country'; player: number; visit: number }
  | { kind: 'question'; player: number; visit: number; anchor: string; type: QuestionType }
  | {
      kind: 'bonus';
      player: number;
      visit: number;
      anchor: string;
      regularIndex: number;
      threshold: number;
    };

export interface CoreApi {
  TYPES: QuestionType[];
  LABELS: Record<string, string>;
  REGIONS: Record<string, string>;
  TIME_LIMITS: Record<Difficulty, number>;
  INITIAL_LIVES: number;
  BONUS_INTERVAL: number;
  MILESTONE_LIVES: number;
  BASE_POINTS: number;
  MAX_POINTS: number;
  CURRENCY_UNITS: Record<string, string>;
  currencyLabel(entry: { code: string; name?: string }): string;
  createEconomy(players?: number): Economy;
  spendCountryAttempt(economy: Economy, player: number): boolean;
  awardPoints(economy: Economy, player: number, points: number): number[];
  awardFlagAttempt(economy: Economy, player: number): void;
  consumeBonus(economy: Economy, player: number): number | null;
  validateProgress(game: unknown): boolean;
  nextBonusThreshold(game: Economy, player: number): number;
  nextTurn(game: Game): Turn;
  needsFlight(game: Game): boolean;
  sameFlagFamily(a: string, b: string): boolean;
  timeLimit(game: Game): number;
  pointsForTime(elapsedMs: number, limitMs: number): number;
  rng(seed: number): () => number;
  shuffle<T>(items: readonly T[], random?: () => number): T[];
  populationLabel(population: number): string;
  makeQuestion(
    country: Country,
    type: QuestionKind,
    all: Country[],
    difficulty?: Difficulty,
    random?: () => number,
  ): BaseQuestion;
  makeGame(all: Country[], options: GameOptions, seed?: number): Game;
  submit(game: Game, selected: number | null, elapsedMs?: number): AnswerResult | null;
  advance(game: Game, all: Country[]): boolean;
  getPool(all: Country[], options: { region: string; difficulty: Difficulty }): Country[];
  validateCountries(all: unknown): boolean;
}

export interface GeoClock {
  limitMs: number;
  accumulated: number;
  running: boolean;
  elapsed(): number;
  remaining(): number;
  start(): GeoClock;
  pause(): GeoClock;
}

export type GeoClockConstructor = new (
  limitMs: number,
  elapsedMs?: number,
  now?: () => number,
) => GeoClock;

export interface FlightState {
  stage: string;
  elapsed: number;
  paused: boolean;
  progress: number;
  remainingMs: number;
  durationMs: number;
  turnsCompleted: number;
  motion: boolean;
  neutral: boolean;
}

export interface RevealOptions {
  neutral?: boolean;
  onStage?: (stage: string) => void;
  onProgress?: (state: FlightState) => void;
  onComplete?: () => void;
}

export interface GeoGlobe {
  lat: number;
  lon: number;
  zoom: number;
  target: Country | null;
  locked: boolean;
  flight: { elapsed: number; spinAngle: number; stage: string } | null;
  pendingComplete: (() => void) | null;
  reveal(country: Country, options?: RevealOptions): void;
  update(timestamp: number): void;
  setMotion(enabled: boolean): void;
  pauseFlight(paused: boolean): void;
  cancelFlight(): void;
}

export interface GeoGlobeConstructor {
  new (canvas: unknown, map: unknown): GeoGlobe;
  FLIGHT: {
    depart: number;
    spin: number;
    settle: number;
    zoom: number;
    total: number;
    turns: number;
  };
}

export interface Score {
  name: string;
  bpm: number;
  key: string;
  stepSeconds: number;
  urgentStepSeconds: number;
  lead: number[];
}

export interface RenderedNote {
  midi: number;
  time: number;
  duration: number;
  type: string;
  level: number;
  group: string;
  slide: number | null;
  envelope: unknown;
}

export interface GeoAudio {
  scene: string;
  paused: boolean;
  unlocked: boolean;
  step: number;
  nextTime: number;
  transpose: number;
  scoreIndex: number;
  questionStartStep: number;
  noteCount: number;
  context: { currentTime: number } | null;
  note(
    midi: number,
    time: number,
    duration: number,
    type?: string,
    level?: number,
    group?: string,
    slide?: number | null,
    envelope?: unknown,
  ): void;
  activeScore(): Score;
  stepDuration(): number;
  playStep(step: number, time: number): void;
  scheduleCue(kind: string, time: number): void;
  setScene(scene: string): void;
  setPaused(paused: boolean): void;
  beginQuestion(key: string): boolean;
  stopVoices(group?: string): void;
  applyTimbre(): void;
  applyVolume(): void;
  runScheduler(): void;
}

export interface GeoAudioConstructor {
  new (settings?: { volume?: number; random?: () => number }): GeoAudio;
  QUESTION_SCORE: Score;
  QUESTION_SCORES: Score[];
}

const source = (relative: string) => readFileSync(join(BASELINE_ROOT, relative), 'utf8');

/** The UMD wrapper takes the `module.exports` branch as soon as `module` is an object. */
function loadUmd<T>(relative: string): T {
  const holder: { exports: unknown } = { exports: {} };
  new Function('module', source(relative))(holder);
  return holder.exports as T;
}

/**
 * The two browser-only files are `(function(root){…})(window)`. Passing the
 * globals they reference as parameters shadows Node's own `setInterval` and
 * keeps the evaluation free of any global mutation.
 */
function loadBrowserGlobal<T>(relative: string, key: string): T {
  const win: Record<string, unknown> = {};
  const stubs = {
    matchMedia: () => ({ matches: false }),
    devicePixelRatio: 1,
    ResizeObserver: class {
      observe(): void {}
      disconnect(): void {}
    },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    document: { hidden: false },
    setInterval: () => 1,
    clearInterval: () => {},
  };
  new Function(
    'window',
    ...Object.keys(stubs),
    source(relative),
  )(win, ...Object.values(stubs));
  return win[key] as T;
}

let core: CoreApi | undefined;
let clock: GeoClockConstructor | undefined;
let globe: GeoGlobeConstructor | undefined;
let audio: GeoAudioConstructor | undefined;
let countries: Country[] | undefined;
let flags: Record<string, string> | undefined;
let validRun: ((run: unknown) => boolean) | undefined;

export function loadCore(): CoreApi {
  return (core ??= loadUmd<CoreApi>('js/core.js'));
}

export function loadClock(): GeoClockConstructor {
  return (clock ??= loadUmd<GeoClockConstructor>('js/clock.js'));
}

export function loadGlobe(): GeoGlobeConstructor {
  return (globe ??= loadBrowserGlobal<GeoGlobeConstructor>('js/globe.js', 'GeoGlobe'));
}

export function loadAudio(): GeoAudioConstructor {
  return (audio ??= loadBrowserGlobal<GeoAudioConstructor>('js/audio.js', 'GeoAudio'));
}

/**
 * Shared, not re-parsed per call: `core.test.ts` proves the engine never
 * mutates this array, which is what makes one copy safe for everyone.
 */
export function loadCountries(): Country[] {
  return (countries ??= JSON.parse(source('data/countries.json')) as Country[]);
}

export function loadFlags(): Record<string, string> {
  return (flags ??= JSON.parse(source('data/flags.json')) as Record<string, string>);
}

/**
 * `isValidRun` is the save-file gate, and it lives inside `app.js`'s DOM-only
 * IIFE with no export of any kind. Lifting its exact source text out is the
 * only way to test real `wg.run.v7` payloads against the shipped predicate
 * rather than against a paraphrase of it.
 */
export function loadIsValidRun(): (run: unknown) => boolean {
  if (validRun !== undefined) return validRun;
  const app = source('js/app.js');
  const start = app.indexOf('function isValidRun(g){');
  const end = app.indexOf('\nif(isValidRun(initialRun)){');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('app.js no longer contains the isValidRun block this helper lifts out');
  }
  const factory = new Function(
    'Core',
    'countries',
    'byCode',
    `${app.slice(start, end)}\nreturn isValidRun;`,
  ) as (
    core: CoreApi,
    all: Country[],
    byCode: Record<string, Country>,
  ) => (run: unknown) => boolean;
  const all = loadCountries();
  validRun = factory(loadCore(), all, Object.fromEntries(all.map((c) => [c.code, c])));
  return validRun;
}
