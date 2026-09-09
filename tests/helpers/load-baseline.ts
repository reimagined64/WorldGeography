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
 * The data model and the core API are not described a second time here: the
 * frozen JavaScript implements exactly the contract `src/engine/` declares, and
 * proving that is what U4 is for, so `CoreApi` is the ported module's own type
 * and the shapes come from `src/engine/types.ts`. The browser-only interface
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
import type { Country } from '../../src/engine/types.ts';

export const BASELINE_ROOT = fileURLToPath(new URL('../fixtures/baseline', import.meta.url));

export type { Country, GameState } from '../../src/engine/types.ts';

/** The v7 engine surface, which is the ported module's own exported surface. */
export type CoreApi = typeof import('../../src/engine/core.ts');

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

let core: CoreApi | undefined;
let clock: GeoClockConstructor | undefined;
let audio: GeoAudioConstructor | undefined;
let countries: Country[] | undefined;
let flags: Record<string, string> | undefined;
const validRuns = new Map<CoreApi, (run: unknown) => boolean>();

export function loadCore(): CoreApi {
  return (core ??= loadUmd<CoreApi>('js/core.js'));
}

export function loadClock(): GeoClockConstructor {
  return (clock ??= loadUmd<GeoClockConstructor>('js/clock.js'));
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
 *
 * The engine is a parameter because the predicate delegates to
 * `Core.validateProgress` and `Core.getPool`: handing it the TypeScript engine
 * is what proves the port still accepts a real player's save.
 */
export function loadIsValidRun(engine: CoreApi = loadCore()): (run: unknown) => boolean {
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
    core: CoreApi,
    all: Country[],
    byCode: Record<string, Country>,
  ) => (run: unknown) => boolean;
  const all = loadCountries();
  const built = factory(engine, all, Object.fromEntries(all.map((c) => [c.code, c])));
  validRuns.set(engine, built);
  return built;
}
