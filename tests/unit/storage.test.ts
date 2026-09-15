/**
 * U6 — player data.
 *
 * Everything under test here is a compatibility claim rather than a behavior:
 * the four key names, the shape that goes into them, and the predicate that
 * decides whether a save from an older build is still playable. A regression in
 * any of them is silent — the player simply loses a run — so the oracle is the
 * frozen v7 source and the four real `wg.run.v7` payloads captured from the
 * shipped build, not a fixture this suite could have written itself.
 *
 * `localStorage` does not exist in Node, and `storage.ts` deliberately reaches
 * for the bare global the way a browser page does, so every test installs one.
 * The blocked-storage case is stubbed the same way; that it also surfaces a
 * toast is a DOM claim and lives in `tests/browser/app-state.spec.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as Engine from '../../src/engine/core.ts';
import { setLocale } from '../../src/i18n/index.ts';
import {
  defaultNames,
  SCHEMA_KEY,
  SCHEMA_VERSION,
  STORE,
  isValidRun,
  loadRecord,
  loadRun,
  loadSettings,
  normalizeSettings,
  read,
  write,
} from '../../src/app/storage.ts';
import type { LocalizedCountry, GameState } from '../../src/engine/types.ts';
import { BASELINE_ROOT, loadCountries } from '../helpers/load-baseline.ts';

interface FakeStorage {
  readonly api: Storage;
  readonly raw: Map<string, string>;
  blocked: boolean;
}

function fakeStorage(): FakeStorage {
  const raw = new Map<string, string>();
  const state = {
    raw,
    blocked: false,
    api: {
      get length(): number {
        return raw.size;
      },
      key: (index: number): string | null => [...raw.keys()][index] ?? null,
      getItem: (key: string): string | null => raw.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        // What Safari in private mode and a full quota both throw.
        if (state.blocked) throw new Error('QuotaExceededError');
        raw.set(key, value);
      },
      removeItem: (key: string): void => {
        raw.delete(key);
      },
      clear: (): void => {
        raw.clear();
      },
    } as Storage,
  };
  return state;
}

const countries = loadCountries();
const byCode: Record<string, LocalizedCountry<'cs'>> = Object.fromEntries(countries.map((c) => [c.code, c]));
const runFixture = (name: string): GameState =>
  JSON.parse(readFileSync(join(BASELINE_ROOT, 'runs', `${name}.json`), 'utf8')) as GameState;
const RUN_NAMES = ['mid-country', 'mid-flight', 'post-milestone', 'pending-bonus'] as const;

let store: FakeStorage;

beforeEach(() => {
  store = fakeStorage();
  vi.stubGlobal('localStorage', store.api);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the storage keys', () => {
  it('still spells the four names the shipped build wrote', () => {
    expect({ ...STORE }).toEqual({
      settings: 'wg.settings.v1',
      run: 'wg.run.v7',
      record: 'wg.record.v7',
      audio: 'wg.audio.v2',
    });
  });

  it('matches the frozen v7 source rather than only itself', () => {
    // The literal above is the contract; this is where it is checked against
    // the build that wrote the data, so a rename cannot pass by editing both.
    const v7 = readFileSync(join(BASELINE_ROOT, 'js/app.js'), 'utf8');
    const declared = /const STORE=\{([^}]*)\};/.exec(v7)?.[1];
    if (declared === undefined) throw new Error('baseline app.js no longer declares STORE');

    const pairs = Object.fromEntries(
      declared.split(',').map((entry) => {
        const [name, value] = entry.split(':');
        return [name?.trim(), value?.trim().replace(/^'|'$/g, '')];
      }),
    );
    expect(pairs).toEqual({ ...STORE });
  });
});

describe('read and write', () => {
  it('round-trips an object and stamps the schema version', () => {
    expect(write(STORE.record, { points: 12000, total: 25, date: '2026-09-09T00:00:00.000Z' })).toBe(true);

    const stored = JSON.parse(store.raw.get(STORE.record) ?? 'null') as Record<string, unknown>;
    expect(stored[SCHEMA_KEY]).toBe(SCHEMA_VERSION);
    // Stripped again on the way out: the runtime never sees the field, so
    // nothing downstream can start depending on it.
    expect(loadRecord()).toEqual({ points: 12000, total: 25, date: '2026-09-09T00:00:00.000Z' });
  });

  it('reads a stored object that predates schemaVersion unchanged', () => {
    store.raw.set(STORE.record, JSON.stringify({ points: 900, total: 3, date: '2026-01-01T00:00:00.000Z' }));
    expect(loadRecord()).toEqual({ points: 900, total: 3, date: '2026-01-01T00:00:00.000Z' });
  });

  it('falls back on a missing key, a null value and unparseable text', () => {
    expect(read('wg.absent', 'fallback')).toBe('fallback');
    store.raw.set('wg.null', 'null');
    expect(read('wg.null', 'fallback')).toBe('fallback');
    store.raw.set('wg.broken', '{oops');
    expect(read('wg.broken', 'fallback')).toBe('fallback');
  });

  it('keeps a stored falsy value that is not null', () => {
    store.raw.set('wg.zero', '0');
    expect(read('wg.zero', 42)).toBe(0);
  });

  it('reports a refusal instead of throwing, and stores nothing', () => {
    store.blocked = true;
    expect(write(STORE.run, { version: 7 })).toBe(false);
    expect(store.raw.size).toBe(0);
    // The page has to keep running: a blocked write is not a crash.
    expect(loadRecord()).toBeNull();
  });
});

describe('settings', () => {
  it('clamps every field a tampered blob could carry', () => {
    const options = normalizeSettings({
      players: 7,
      difficulty: 'impossible',
      region: 'Atlantis',
      motion: 'wobbly',
      names: ['x'.repeat(40), ''],
      visits: 12,
    });

    expect(options.players).toBe(1);
    expect(options.difficulty).toBe('normal');
    expect(options.region).toBe('all');
    expect(options.motion).toBe('full');
    expect(options.names[0]).toHaveLength(24);
    expect(options.names[1]).toBe(defaultNames()[1]);
    expect('visits' in options).toBe(false);
  });

  it('keeps a valid stored blob and never hands back the shared defaults', () => {
    write(STORE.settings, { players: 2, difficulty: 'expert', region: 'Europe', motion: 'reduced', names: ['A', 'B'] });
    const options = loadSettings();

    expect(options).toMatchObject({ players: 2, difficulty: 'expert', region: 'Europe', motion: 'reduced' });
    expect(options.names).toEqual(['A', 'B']);
    options.names[0] = 'mutated';
    expect(defaultNames()[0]).toBe('Hráč 1');
  });

  it('re-renders an untouched placeholder name in the reader\'s language', () => {
    // U11: a name the player never typed is the setup screen's placeholder, and
    // it follows the language. A name they did type never does, in either
    // direction — that is the whole distinction this makes.
    write(STORE.settings, { players: 2, names: ['Hráč 1', 'Grace'] });

    setLocale('en');
    expect(loadSettings().names).toEqual(['Player 1', 'Grace']);
    setLocale('cs');
    expect(loadSettings().names).toEqual(['Hráč 1', 'Grace']);
  });
});

describe('isValidRun', () => {
  const valid = (): GameState => runFixture('mid-country');
  const check = (run: unknown): boolean => isValidRun(run, countries, byCode);

  it('accepts every real captured payload', () => {
    for (const name of RUN_NAMES) expect(check(runFixture(name))).toBe(true);
  });

  it.each([
    ['a version other than 7', (g: GameState) => { g.version = 6; }],
    ['a completed run', (g: GameState) => { g.completed = true; }],
    ['an empty question list', (g: GameState) => { g.questions = []; }],
    ['an index past the last question', (g: GameState) => { g.index = g.questions.length; }],
    ['a negative index', (g: GameState) => { g.index = -1; }],
    ['a question with a repeated option', (g: GameState) => {
      const q = g.questions[0]!;
      q.options = [q.options[0]!, q.options[0]!, q.options[2]!];
    }],
    ['a question with fewer than three options', (g: GameState) => {
      g.questions[0]!.options = ['A', 'B'];
    }],
    ['a run that fails validateProgress', (g: GameState) => {
      // One point off a stored answer: the ledger replay no longer matches.
      g.answers[0]!.points += 10;
    }],
  ])('rejects %s', (_name, tamper) => {
    const run = valid();
    expect(check(run)).toBe(true);
    tamper(run);
    expect(check(run)).toBe(false);
  });

  it('rejects a run whose deck holds a code outside the pool', () => {
    const run = valid();
    run.deck = [...run.deck, 'ZZ' as GameState['deck'][number]];
    expect(check(run)).toBe(false);
  });

  it('agrees with the engine about the tampered payload', () => {
    const run = valid();
    run.answers[0]!.points += 10;
    expect(Engine.validateProgress(run)).toBe(false);
  });

  it('rejects nothing at all', () => {
    expect(check(null)).toBe(false);
    expect(check(undefined)).toBe(false);
    expect(check('wg.run.v7')).toBe(false);
  });
});

describe('loadRun', () => {
  it.each(RUN_NAMES)('still loads the captured %s payload', (name) => {
    const saved = runFixture(name);
    store.raw.set(STORE.run, JSON.stringify(saved));

    const loaded = loadRun(countries, byCode);
    expect(loaded).not.toBeNull();
    expect(loaded?.index).toBe(saved.index);
    expect(loaded?.questions).toHaveLength(saved.questions.length);
  });

  it('loads a payload this build wrote back, schemaVersion and all', () => {
    // The round trip a returning player actually makes.
    write(STORE.run, runFixture('post-milestone'));
    expect(JSON.parse(store.raw.get(STORE.run) ?? 'null')[SCHEMA_KEY]).toBe(SCHEMA_VERSION);
    expect(loadRun(countries, byCode)).not.toBeNull();
  });

  it('resumes a live clock paused, and drops one from another question', () => {
    const running = runFixture('mid-country');
    running.clock = { index: running.index, elapsedMs: 4200, paused: false };
    store.raw.set(STORE.run, JSON.stringify(running));
    expect(loadRun(countries, byCode)?.clock).toEqual({ index: running.index, elapsedMs: 4200, paused: true });

    const stale = runFixture('mid-country');
    stale.clock = { index: stale.index + 3, elapsedMs: 4200, paused: false };
    store.raw.set(STORE.run, JSON.stringify(stale));
    expect(loadRun(countries, byCode)?.clock).toBeNull();
  });

  it('returns null for a rejected payload rather than throwing', () => {
    store.raw.set(STORE.run, JSON.stringify({ version: 6 }));
    expect(loadRun(countries, byCode)).toBeNull();
  });
});
