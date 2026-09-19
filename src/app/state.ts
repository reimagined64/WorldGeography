/**
 * The shared store, and the debug surface that reads it.
 *
 * v7 kept all of this as `let` bindings inside one IIFE, which is why every
 * view had to live in that same file. Thirteen of those bindings are genuinely
 * shared and they live here; the rest — `atlasQuery`, `clockRAF`, `toastTimer`
 * and friends — belong to exactly one view and stay with it. Nothing else in
 * the tree may declare one of these thirteen: two copies of `phase` is the
 * whole class of bug this file exists to make impossible.
 *
 * `clock` and `clockIndex` look game-local and are not: `getStatus()` reports
 * both, so the debug API cannot be built without them. `revealToken` and
 * `flightKey` are the cancellation tokens of a twelve-second choreography and
 * have to stay reachable from `leaveGame`, or a reveal fires into a screen the
 * player already left.
 *
 * `globe` and `audio` are constructed once during boot rather than at import,
 * so they are nullable in the store and reached through the two accessors —
 * a missing instance is a wiring bug and says so, instead of surfacing as
 * `undefined is not a function` somewhere in a render.
 */
import * as Core from '../engine/core.ts';
import type { GeoAudio } from '../audio/audio.ts';
import type { GeoClock } from '../engine/clock.ts';
import type { BaseQuestion, Difficulty, GameState, QuestionKind } from '../engine/types.ts';
import type { FlightState, Globe } from '../globe/globe.ts';
import { t } from '../i18n/index.ts';
import { questionBundle } from '../i18n/questions.ts';
import { countries } from './database.ts';
import { normalizeSettings, type AppSettings, type HighScore } from './storage.ts';

/** The four screens `setView` switches between. */
export type View = 'home' | 'game' | 'atlas' | 'results';

/** Where a game is between two answers. `idle` is "no question on screen". */
export type Phase = 'idle' | 'flying' | 'question' | 'paused' | 'feedback';

export interface Store {
  game: GameState | null;
  view: View;
  phase: Phase;
  options: AppSettings;
  lastGlobeCode: string | null;
  record: HighScore | null;
  selected: number;
  revealToken: number;
  flightKey: string | null;
  clock: GeoClock | null;
  clockIndex: number;
  globe: Globe | null;
  audio: GeoAudio | null;
}

export const store: Store = {
  game: null,
  view: 'home',
  phase: 'idle',
  options: normalizeSettings(null),
  lastGlobeCode: null,
  record: null,
  selected: 0,
  revealToken: 0,
  flightKey: null,
  clock: null,
  clockIndex: -1,
  globe: null,
  audio: null,
};

/** The store's own inventory, so a test can state the rule it enforces. */
export const STORE_KEYS: readonly (keyof Store)[] = Object.freeze([
  'game', 'view', 'phase', 'options', 'lastGlobeCode', 'record', 'selected',
  'revealToken', 'flightKey', 'clock', 'clockIndex', 'globe', 'audio',
] as const);

export function requireGlobe(): Globe {
  if (store.globe === null) throw new Error(t('boot.noGlobe'));
  return store.globe;
}

export function requireAudio(): GeoAudio {
  if (store.audio === null) throw new Error(t('boot.noAudio'));
  return store.audio;
}

/** What `getStatus().clock` reports: the live clock, flattened. */
export interface ClockStatus {
  elapsedMs: number;
  remainingMs: number;
  running: boolean;
  index: number;
}

export interface GlobeStatus {
  latitude: number;
  longitude: number;
  zoom: number;
  locked: boolean;
  flight: FlightState | null;
}

export interface DebugStatus {
  phase: Phase;
  clock: ClockStatus | null;
  globe: GlobeStatus;
  audio: ReturnType<GeoAudio['status']>;
}

export interface DebugApi {
  getState(): GameState | null;
  getView(): View;
  getStatus(): DebugStatus;
  /** U14's addition to v7's five members. See `getQuestionSet` below. */
  getQuestionSet(difficulty: Difficulty, seed: number): BaseQuestion[];
  readonly version: string;
  readonly edition: string;
}

/** The six kinds, in the order every question walk in this project uses. */
const QUESTION_KINDS: readonly QuestionKind[] = Object.freeze([...Core.TYPES, 'flag']);

const DIFFICULTIES: readonly Difficulty[] = Object.freeze(['easy', 'normal', 'expert']);

/**
 * The page's own test surface.
 *
 * `getState` deep-copies because the browser suites read it while a game is
 * running: handing out the live object would let a spec that pokes at the
 * result change the run it was measuring. The version string is the *game's*,
 * not the package's — a save, a record and this number all say 7.
 *
 * `getQuestionSet` is U14's one addition to the five members v7 froze, and it
 * is what `tests/browser/golden-dist.spec.ts` needs: the obfuscated bundle is
 * the only build a player ever runs, and nothing else can ask it to generate a
 * question. A twenty-question playthrough touches twenty of the 14,040
 * variants, so a transform that corrupted one string in one branch — an RC4
 * table entry, a `splitStrings` chunk, a flattened control path taken only by
 * `expert` — would ship. This walks all of them and hands the text back.
 *
 * It generates rather than reads: nothing is cached, `store` is untouched, and
 * a fresh `rng(seed)` per question is what makes each variant independent of
 * the ones before it, exactly as `captureQuestions` recorded them. The bundle
 * it writes them in is the live one, so switching the language switches what
 * this returns — which is how the English half is reached.
 *
 * The two argument checks throw plain English rather than a catalog key: no
 * player reaches this method, and inventing `cs`/`en` copy for a message only
 * a spec can provoke would be two translations of a lie.
 */
export function createDebugApi(): Readonly<DebugApi> {
  return Object.freeze({
    getState: (): GameState | null =>
      store.game ? (JSON.parse(JSON.stringify(store.game)) as GameState) : null,
    getQuestionSet: (difficulty: Difficulty, seed: number): BaseQuestion[] => {
      if (!DIFFICULTIES.includes(difficulty)) throw new TypeError(`getQuestionSet: unknown difficulty ${String(difficulty)}`);
      if (!Number.isSafeInteger(seed) || seed < 0) throw new TypeError(`getQuestionSet: seed must be a non-negative integer, got ${String(seed)}`);
      const bundle = questionBundle();
      return countries.flatMap((country) =>
        QUESTION_KINDS.map((kind) =>
          Core.makeQuestion(country, kind, countries, bundle, difficulty, Core.rng(seed))));
    },
    getView: (): View => store.view,
    getStatus: (): DebugStatus => {
      const globe = requireGlobe();
      const clock = store.clock;
      return {
        phase: store.phase,
        clock: clock
          ? { elapsedMs: clock.elapsed(), remainingMs: clock.remaining(), running: clock.running, index: store.clockIndex }
          : null,
        globe: {
          latitude: globe.lat * 180 / Math.PI,
          longitude: globe.lon * 180 / Math.PI,
          zoom: globe.zoom,
          locked: globe.locked,
          flight: globe.flightState(),
        },
        audio: requireAudio().status(),
      };
    },
    version: '7.0.0',
    edition: '2026-09-07',
  });
}

/** Publish the frozen API under the name v7 froze it under. */
export function installDebugApi(target: Record<string, unknown>): Readonly<DebugApi> {
  const api = createDebugApi();
  target['WorldGeography'] = api;
  return api;
}
