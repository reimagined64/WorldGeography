/**
 * Player data: the four `localStorage` keys, the codec around them, and the
 * gate a saved run has to pass before it is allowed back into a game.
 *
 * The key names are the compatibility contract — a save written by the shipped
 * v7 build has to keep loading — so they are spelled out once, here, and
 * nowhere else in the tree.
 *
 * `schemaVersion` is written onto every stored object and stripped again on the
 * way out. That asymmetry is the point: the runtime never sees the field, so a
 * v7 payload that predates it and one written today are indistinguishable to
 * `isValidRun`, to `validateProgress` and to `getState()`, while the next
 * format change still has a version to branch on.
 *
 * `write` reports a refusal instead of throwing. A browser in private mode or
 * over quota is an ordinary condition, not a crash — but it is one the player
 * has to be told about, which is `persist` in `app/dom.ts` and the toast it
 * raises.
 */
import * as Core from '../engine/core.ts';
import type { AudioSettings } from '../audio/audio.ts';
import type { Country, GameOptions, GameState } from '../engine/types.ts';

/** The v7 key names. Changing any string here discards every player's data. */
export const STORE = Object.freeze({
  settings: 'wg.settings.v1',
  run: 'wg.run.v7',
  record: 'wg.record.v7',
  audio: 'wg.audio.v2',
});

/** The migration point. Absent from a v7 payload, which reads as version 0. */
export const SCHEMA_KEY = 'schemaVersion';
export const SCHEMA_VERSION = 1;

/** The game options plus the one setting only the shell cares about. */
export interface AppSettings extends GameOptions {
  motion: 'full' | 'reduced';
}

/** `wg.record.v7`: the single best run the home screen and results print. */
export interface HighScore {
  points: number;
  total: number;
  date: string;
}

export const DEFAULT_SETTINGS: Readonly<AppSettings> = Object.freeze({
  players: 1,
  names: ['Hráč 1', 'Hráč 2'],
  difficulty: 'normal' as const,
  region: 'all' as const,
  motion: 'full' as const,
});

/**
 * Parse, and hand back the v7 shape.
 *
 * `JSON.parse(null)` is `null`, so a missing key and a stored `null` both fall
 * back exactly as v7's `?? fallback` did; a stored `0` or `''` does not.
 */
export function read<T>(key: string, fallback: T): T {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) as string);
    if (parsed === null || parsed === undefined) return fallback;
    if (typeof parsed === 'object' && !Array.isArray(parsed) && SCHEMA_KEY in parsed) {
      const copy: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
      delete copy[SCHEMA_KEY];
      return copy as T;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

/** Serialize and store, stamping the schema. `false` means the browser said no. */
export function write(key: string, value: unknown): boolean {
  try {
    const stamped =
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? { ...(value as Record<string, unknown>), [SCHEMA_KEY]: SCHEMA_VERSION }
        : value;
    localStorage.setItem(key, JSON.stringify(stamped));
    return true;
  } catch {
    return false;
  }
}

/**
 * Clamp stored settings back into the range the UI can render.
 *
 * Unrecognized keys survive the way they did in v7 — `makeGame` copies the
 * object wholesale and neither `isValidRun` nor `validateProgress` looks past
 * the four fields it checks — and `visits` is deleted because a v6 save carries
 * one and a v7 game must not.
 */
export function normalizeSettings(saved: unknown): AppSettings {
  const options = {
    ...DEFAULT_SETTINGS,
    ...(saved !== null && typeof saved === 'object' ? saved : {}),
  } as AppSettings;

  if (![1, 2].includes(options.players)) options.players = 1;
  if (!['easy', 'normal', 'expert'].includes(options.difficulty)) options.difficulty = 'normal';
  if (!['all', ...Object.keys(Core.REGIONS)].includes(options.region)) options.region = 'all';
  delete options.visits;
  if (!['full', 'reduced'].includes(options.motion)) options.motion = 'full';

  const names: unknown = options.names;
  options.names = Array.isArray(names)
    ? [0, 1].map((i) => String((names as unknown[])[i] || DEFAULT_SETTINGS.names[i]).slice(0, 24))
    : [...DEFAULT_SETTINGS.names];
  return options;
}

export function loadSettings(): AppSettings {
  return normalizeSettings(read<unknown>(STORE.settings, {}));
}

export function loadAudioSettings(): AudioSettings {
  return read<AudioSettings>(STORE.audio, {});
}

export function loadRecord(): HighScore | null {
  return read<HighScore | null>(STORE.record, null);
}

/**
 * The save-file gate, unchanged from v7 line for line.
 *
 * It is this strict on purpose: `validateProgress` replays the run and compares
 * every stored answer field by field, so a payload that has been edited, or
 * that was written by a build whose engine disagrees with this one, is dropped
 * rather than resumed into a game that would then be wrong about attempts.
 */
export function isValidRun(
  run: unknown,
  countries: Country[],
  byCode: Readonly<Record<string, Country>>,
): boolean {
  const g = run as GameState;
  try {
    if(!g||g.version!==7||g.completed||!Array.isArray(g.questions)||!g.questions.length||!Number.isInteger(g.index)||g.index<0||g.index>=g.questions.length)return false;
    if(!g.options||![1,2].includes(g.options.players)||!['easy','normal','expert'].includes(g.options.difficulty)||!['all',...Object.keys(Core.REGIONS)].includes(g.options.region)||!Array.isArray(g.options.names)||!g.options.names.every(n=>typeof n==='string'))return false;
    if(!Array.isArray(g.answers)||!Array.isArray(g.scores)||g.scores.length!==g.options.players||!g.scores.every(n=>Number.isFinite(n)&&n>=0))return false;
    if(!g.questions.every(q=>byCode[q.country]&&[...Core.TYPES,'flag'].includes(q.type)&&Array.isArray(q.options)&&q.options.every(t=>typeof t==='string')&&q.options.length===3&&new Set(q.options).size===3&&Number.isInteger(q.correct)&&q.correct>=0&&q.correct<3&&Number.isInteger(q.player)&&q.player>=0&&q.player<g.options.players&&Number.isInteger(q.visit)))return false;
    // The one textual departure from v7: `a.selected!==null` is added purely
    // to narrow the type for `>=`. `Number.isInteger` is not a type guard, and
    // it has already returned false for `null` by the time that check runs.
    if(g.answers.length>g.index+1||!g.answers.every(a=>a&&typeof a.correct==='boolean'&&Number.isFinite(a.points)&&a.points>=0&&a.points<=Core.MAX_POINTS&&Number.isFinite(a.elapsedMs)&&a.elapsedMs>=0&&((Number.isInteger(a.selected)&&a.selected!==null&&a.selected>=0&&a.selected<3)||(a.timedOut&&a.selected===null))))return false;
    for(let i=0;i<g.index;i++)if(!g.answers[i])return false;
    if(!g.review){
      if(g.questions.length!==g.index+1||!Array.isArray(g.lives)||g.lives.length!==g.options.players||!g.lives.every(n=>Number.isSafeInteger(n)&&n>=0))return false;
      if(!Array.isArray(g.earnedLives)||g.earnedLives.length!==g.options.players||!g.earnedLives.every(n=>Number.isSafeInteger(n)&&n>=0))return false;
      if(!Array.isArray(g.bonusMilestones)||g.bonusMilestones.length!==g.options.players||!g.bonusMilestones.every(n=>Number.isSafeInteger(n)&&n>=0))return false;
      const pool=new Set(Core.getPool(countries,g.options).map(c=>c.code));
      if(!Array.isArray(g.deck)||new Set(g.deck).size!==g.deck.length||!g.deck.every(code=>pool.has(code))||!Number.isSafeInteger(g.seed))return false;
      if(!Array.isArray(g.recentFlags)||g.recentFlags.length>6||!g.recentFlags.every(code=>byCode[code]))return false;
      if(!Core.validateProgress(g))return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Read `wg.run.v7` and hand back a game only if it is one.
 *
 * A stored clock survives only while it still describes the question the run is
 * on, and it always comes back paused: the player left, so the countdown that
 * was running when the tab closed is not theirs to keep losing.
 */
export function loadRun(
  countries: Country[],
  byCode: Readonly<Record<string, Country>>,
): GameState | null {
  const run = read<unknown>(STORE.run, null);
  if (!isValidRun(run, countries, byCode)) return null;
  const game = run as GameState;
  if (game.clock && game.clock.index === game.index && Number.isFinite(game.clock.elapsedMs) && game.clock.elapsedMs >= 0) game.clock.paused = true;
  else game.clock = null;
  return game;
}
