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
 * The data model is declared here rather than imported, which it was not until
 * U12. `src/engine/types.ts` described one country record and the frozen
 * JavaScript happened to implement it; U12 moved the engine onto the bilingual
 * record and the two shapes parted company, so `LegacyCountry` and
 * `LegacyCoreApi` below are what the *fixture* is — v7, in one language, with
 * no bundle argument anywhere. `loadCountries` lifts the fixture into the
 * bilingual shape the ported engine takes, which is a widening and not a
 * translation: a `LocalizedText<'cs'>` has one key and it is the Czech one.
 * The browser-only interface
 * below stays narrow on purpose — it covers only the surface the suites touch,
 * so a mistyped field fails a typecheck rather than hiding under `any`.
 *
 * What is loaded shrinks as the port lands. U5 took the globe loader with it;
 * the synthesizer stays because `golden.test.ts` holds `audio-golden.json` to
 * the theme names and lead lengths of the *original* scores, which is a claim
 * about the fixture rather than about the port.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AnswerResult,
  BaseQuestion,
  CurrencyCode,
  CurrencyName,
  Difficulty,
  GameOptions,
  GameState,
  Iso2,
  Iso3,
  LangCode,
  LocalizedCountry,
  ProgressState,
  QuestionKind,
  QuestionType,
  Region,
  RegionFilter,
  RunState,
  Turn,
} from '../../src/engine/types.ts';

export const BASELINE_ROOT = fileURLToPath(new URL('../fixtures/baseline', import.meta.url));

export type { GameState } from '../../src/engine/types.ts';

/** The country record v7 shipped: one language, flat strings. */
export interface LegacyCountry {
  code: Iso2;
  iso3: Iso3;
  name: string;
  capital: string[];
  currency: CurrencyCode[];
  currencyNames: CurrencyName[];
  languages: LangCode[];
  languageNames: string[];
  excludeLanguages: LangCode[];
  lat: number;
  lon: number;
  region: Region;
  population: number;
  populationYear: number;
  populationKind: string;
  populationSource: string;
  note: string;
  easy: boolean;
}

/**
 * The frozen engine's surface, as far as anything here drives it.
 *
 * Narrow on purpose and no longer `typeof src/engine/core.ts`: that alias was a
 * statement that the port had not changed the API, and U12 changed it. What the
 * fixture exports is the v7 API, and this is it.
 */
export interface LegacyCoreApi {
  readonly TYPES: readonly QuestionType[];
  readonly LABELS: Readonly<Record<QuestionKind, string>>;
  readonly REGIONS: Readonly<Record<Region, string>>;
  readonly CURRENCY_UNITS: Readonly<Record<string, string>>;
  readonly TIME_LIMITS: Readonly<Record<Difficulty, number>>;
  readonly INITIAL_LIVES: number;
  readonly BONUS_INTERVAL: number;
  readonly MILESTONE_LIVES: number;
  readonly BASE_POINTS: number;
  readonly MAX_POINTS: number;
  rng(seed: number): () => number;
  shuffle<T>(items: readonly T[], random?: () => number): T[];
  populationLabel(n: number): string;
  currencyLabel(currency: { code: CurrencyCode }): string;
  makeQuestion(
    country: LegacyCountry,
    type: QuestionKind,
    all: LegacyCountry[],
    difficulty?: Difficulty,
    random?: () => number,
  ): BaseQuestion;
  makeGame(all: LegacyCountry[], options: GameOptions, seed?: number): GameState;
  submit(game: ProgressState, selected: number | null, elapsedMs?: number): AnswerResult | null;
  advance(game: GameState, all: LegacyCountry[]): boolean;
  nextTurn(game: ProgressState): Turn;
  needsFlight(game: ProgressState): boolean;
  sameFlagFamily(a: Iso2, b: Iso2): boolean;
  timeLimit(game: ProgressState): number;
  pointsForTime(elapsedMs: number, limitMs: number): number;
  getPool(all: LegacyCountry[], options: { region: RegionFilter; difficulty: Difficulty }): LegacyCountry[];
  createEconomy(players?: number): RunState;
  spendCountryAttempt(game: RunState, player: number): boolean;
  awardPoints(game: RunState, player: number, points: number): number[];
  awardFlagAttempt(game: RunState, player: number): void;
  consumeBonus(game: RunState, player: number): number | null;
  nextBonusThreshold(game: RunState, player: number): number;
  validateProgress(game: GameState): boolean;
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
 * The browser-only files are `(function(root){…})(window)`. Passing the globals
 * they reference as parameters shadows Node's own `setInterval` and keeps the
 * evaluation free of any global mutation. The stub set still covers the globe's
 * needs as well as the synthesizer's: `js/globe.js` is one of the files the
 * byte-identity gate concatenates, so it stays loadable.
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

let core: LegacyCoreApi | undefined;
let clock: GeoClockConstructor | undefined;
let audio: GeoAudioConstructor | undefined;
let legacy: LegacyCountry[] | undefined;
let countries: LocalizedCountry<'cs'>[] | undefined;
let flags: Record<string, string> | undefined;
const validRuns = new Map<object, (run: unknown) => boolean>();

export function loadCore(): LegacyCoreApi {
  return (core ??= loadUmd<LegacyCoreApi>('js/core.js'));
}

export function loadClock(): GeoClockConstructor {
  return (clock ??= loadUmd<GeoClockConstructor>('js/clock.js'));
}

export function loadAudio(): GeoAudioConstructor {
  return (audio ??= loadBrowserGlobal<GeoAudioConstructor>('js/audio.js', 'GeoAudio'));
}

/** The fixture as it is on disk: one language, the shape the frozen engine reads. */
export function loadLegacyCountries(): LegacyCountry[] {
  return (legacy ??= JSON.parse(source('data/countries.json')) as LegacyCountry[]);
}

/**
 * The same fixture, widened to the record the ported engine takes.
 *
 * `LocalizedText<'cs'>` is `{ cs: string }` — one key, the language the file is
 * already in — so this adds no information and invents no translation. It is
 * what lets the golden oracle stay the frozen v7 data while the engine that is
 * measured against it has moved on.
 *
 * Shared, not re-parsed per call: `core.test.ts` proves the engine never
 * mutates this array, which is what makes one copy safe for everyone.
 */
export function loadCountries(): LocalizedCountry<'cs'>[] {
  return (countries ??= loadLegacyCountries().map((c) => ({
    ...c,
    name: { cs: c.name },
    capital: c.capital.map((city) => ({ cs: city })),
    currencyNames: c.currencyNames.map((unit) => ({ code: unit.code, name: { cs: unit.name } })),
    languageNames: c.languageNames.map((tag) => ({ cs: tag })),
    note: { cs: c.note },
  })));
}

export function loadFlags(): Record<string, string> {
  return (flags ??= JSON.parse(source('data/flags.json')) as Record<string, string>);
}

/**
 * `isValidRun` is the save-file gate, and it lives inside `app.js`'s DOM-only
 * IIFE with no export of any kind. Lifting its exact source text out is the
 * only way to test real `wg.run.v7` payloads against the shipped predicate
 * rather than against a paraphrase of it.
 *
 * The engine is a parameter because the predicate delegates to
 * `Core.validateProgress` and `Core.getPool`: handing it the TypeScript engine
 * is what proves the port still accepts a real player's save.
 */
export function loadIsValidRun<E extends object>(engine: E): (run: unknown) => boolean {
  const cached = validRuns.get(engine);
  if (cached !== undefined) return cached;
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
    core: E,
    all: unknown[],
    byCode: Record<string, unknown>,
  ) => (run: unknown) => boolean;
  const all: { code: Iso2 }[] = loadCountries();
  const built = factory(engine, all, Object.fromEntries(all.map((c) => [c.code, c])));
  validRuns.set(engine, built);
  return built;
}
