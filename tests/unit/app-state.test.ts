/**
 * U6 — the shared store and the debug API that reads it.
 *
 * Two claims, and neither is about rendering. The first is that
 * `window.WorldGeography` still reports what v7 reported: the browser suites
 * and every future one steer on it, so its shape is checked against the frozen
 * `js/app.js` rather than against this file's own expectations.
 *
 * The second is structural — that the thirteen shared variables exist in one
 * place. A second `let phase` somewhere would not fail a typecheck, would not
 * fail a render, and would produce a game that pauses in one module and not in
 * the other, so it is checked by reading the sources. The scanner that does
 * that is itself checked against the frozen v7 monolith, which declares all of
 * them and therefore must light it up.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GeoClock } from '../../src/engine/clock.ts';
import { STORE_KEYS, installDebugApi, store, type Store } from '../../src/app/state.ts';
import type { GameState } from '../../src/engine/types.ts';
import { BASELINE_ROOT } from '../helpers/load-baseline.ts';

const SRC_ROOT = fileURLToPath(new URL('../../src', import.meta.url));
const V7_APP = readFileSync(join(BASELINE_ROOT, 'js/app.js'), 'utf8');

/** Enough of a globe and a synthesizer for `getStatus` to report on. */
const fakeGlobe = {
  lat: Math.PI / 4,
  lon: -Math.PI / 2,
  zoom: 1.25,
  locked: false,
  flightState: () => null,
};
const fakeAudio = {
  status: () => ({ enabled: true, scene: 'question', notes: 12 }),
};

const snapshot = { ...store };

beforeEach(() => {
  Object.assign(store, snapshot);
  store.globe = fakeGlobe as unknown as Store['globe'];
  store.audio = fakeAudio as unknown as Store['audio'];
});

afterEach(() => {
  Object.assign(store, snapshot);
});

describe('the shared store', () => {
  it('holds the thirteen shared variables and nothing else', () => {
    expect(Object.keys(store).sort()).toEqual([...STORE_KEYS].sort());
    expect(STORE_KEYS).toHaveLength(13);
  });

  it('starts on the home screen with a normalized options object', () => {
    expect(store.view).toBe('home');
    expect(store.phase).toBe('idle');
    expect(store.clockIndex).toBe(-1);
    expect(store.options).toMatchObject({ players: 1, difficulty: 'normal', region: 'all', motion: 'full' });
  });
});

describe('window.WorldGeography', () => {
  const install = (): Record<string, unknown> => {
    const target: Record<string, unknown> = {};
    installDebugApi(target);
    return target;
  };
  type Api = ReturnType<typeof installDebugApi>;
  const api = (): Api => install()['WorldGeography'] as Api;

  it('exposes exactly the members the shipped build froze onto window', () => {
    const shipped = /window\.WorldGeography=Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(V7_APP)?.[1];
    if (shipped === undefined) throw new Error('baseline app.js no longer freezes window.WorldGeography');

    const declared = [...shipped.matchAll(/(?:^|[,{\s])(getState|getView|getStatus|version|edition)\s*:/g)]
      .map((match) => match[1]);
    expect(Object.keys(api()).sort()).toEqual([...declared].sort());
  });

  it('reports the game version and edition, not the package version', () => {
    expect(V7_APP).toContain("version:'7.0.0',edition:'2026-09-07'");
    expect(api().version).toBe('7.0.0');
    expect(api().edition).toBe('2026-09-07');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(api())).toBe(true);
  });

  it('returns null for getState until a game exists', () => {
    expect(api().getState()).toBeNull();
    expect(api().getView()).toBe('home');
  });

  it('hands back a deep copy of the game, not the game', () => {
    const game = { version: 7, index: 0, scores: [100], questions: [{ options: ['a', 'b', 'c'] }] } as unknown as GameState;
    store.game = game;

    const copy = api().getState() as unknown as { scores: number[]; questions: { options: string[] }[] };
    expect(copy).toEqual(JSON.parse(JSON.stringify(game)));
    expect(copy).not.toBe(game);

    copy.scores[0] = 999999;
    copy.questions[0]!.options[0] = 'tampered';
    expect(game.scores[0]).toBe(100);
    expect((game.questions[0] as unknown as { options: string[] }).options[0]).toBe('a');
  });

  it('reports the phase, the clock and its index', () => {
    // `clockIndex` is the reason the clock cannot be game-view-local: nothing
    // else knows which question the live clock belongs to.
    let clockNow = 1000;
    store.phase = 'question';
    store.clockIndex = 4;
    store.clock = new GeoClock(20000, 5000, () => clockNow);
    store.clock.start();
    clockNow = 3000;

    const status = api().getStatus();
    expect(Object.keys(status)).toEqual(['phase', 'clock', 'globe', 'audio']);
    expect(status.phase).toBe('question');
    expect(Object.keys(status.clock ?? {})).toEqual(['elapsedMs', 'remainingMs', 'running', 'index']);
    expect(status.clock).toEqual({ elapsedMs: 7000, remainingMs: 13000, running: true, index: 4 });
  });

  it('reports no clock between questions', () => {
    store.clock = null;
    expect(api().getStatus().clock).toBeNull();
  });

  it('reports the globe in degrees and the synthesizer as it reports itself', () => {
    const status = api().getStatus();
    expect(Object.keys(status.globe)).toEqual(['latitude', 'longitude', 'zoom', 'locked', 'flight']);
    expect(status.globe.latitude).toBeCloseTo(45, 10);
    expect(status.globe.longitude).toBeCloseTo(-90, 10);
    expect(status.globe.zoom).toBe(1.25);
    expect(status.audio).toEqual(fakeAudio.status());
  });

  it('says so rather than crashing if it is installed before the globe exists', () => {
    store.globe = null;
    expect(() => api().getStatus()).toThrow(/Glóbus/);
  });
});

/**
 * Blank out string, template, regex and comment contents.
 *
 * Without this the Czech UI prose counts: `dokud` sits four characters after a
 * `let` inside one of the dialog templates. Regex literals have to go too —
 * v7's `esc` matches on `/[&<>"']/`, whose character class would otherwise open
 * a string that swallows the rest of the file.
 */
function stripLiterals(source: string): string {
  const REGEX_MAY_START = '([{,;=:!&|?+-*%~^<>';
  let out = '';
  let prev = '';
  let i = 0;
  const blank = (text: string): void => {
    out += text.replace(/[^\n]/g, ' ');
  };
  while (i < source.length) {
    const c = source[i]!;
    const two = source.slice(i, i + 2);
    if (two === '//' || two === '/*') {
      const end = two === '//' ? source.indexOf('\n', i) : source.indexOf('*/', i + 2) + 2;
      const stop = end <= 0 ? source.length : end;
      blank(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== c) j += source[j] === '\\' ? 2 : 1;
      blank(source.slice(i, Math.min(j + 1, source.length)));
      i = j + 1;
      prev = ' ';
      continue;
    }
    if (c === '/' && REGEX_MAY_START.includes(prev)) {
      let j = i + 1;
      let inClass = false;
      while (j < source.length) {
        const d = source[j]!;
        if (d === '\\') { j += 2; continue; }
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) break;
        j++;
      }
      blank(source.slice(i, Math.min(j + 1, source.length)));
      i = j + 1;
      prev = ' ';
      continue;
    }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

/** Names bound by a `let` or `var` declarator, parens and strings respected. */
function mutableDeclarations(text: string): string[] {
  const source = stripLiterals(text);
  const found: string[] = [];
  for (const keyword of source.matchAll(/(?:^|[^.\w$])(?:let|var)\s+/g)) {
    let i = (keyword.index ?? 0) + keyword[0].length;
    let depth = 0;
    let expectName = true;
    while (i < source.length) {
      const c = source[i]!;
      if (c === '"' || c === "'" || c === '`') {
        i++;
        while (i < source.length && source[i] !== c) i += source[i] === '\\' ? 2 : 1;
        i++;
        continue;
      }
      if (depth === 0 && (c === ';' || c === '\n')) break;
      if ('([{'.includes(c)) { depth++; i++; continue; }
      if (')]}'.includes(c)) { if (depth === 0) break; depth--; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (depth === 0 && c === ',') { expectName = true; i++; continue; }
      if (expectName) {
        const name = /^[A-Za-z_$][\w$]*/.exec(source.slice(i));
        expectName = false;
        if (name) { found.push(name[0]); i += name[0].length; continue; }
      }
      i++;
    }
  }
  return found;
}

function sourceFiles(dir: string, into: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, into);
    else if (/\.(?:ts|js)$/.test(entry.name)) into.push(path);
  }
  return into;
}

describe('one home for the shared state', () => {
  it('finds the declarations the frozen v7 monolith really makes', () => {
    // The positive control. `js/app.js` declares ten of the thirteen in one
    // `let`; a scanner that missed them would make the rule below vacuous.
    const declared = new Set(mutableDeclarations(V7_APP));
    for (const name of ['game', 'view', 'phase', 'options', 'lastGlobeCode', 'record', 'selected', 'revealToken', 'flightKey', 'clock', 'clockIndex']) {
      expect(`${name}: declared in v7 = ${String(declared.has(name))}`).toBe(`${name}: declared in v7 = true`);
    }
    // And does not simply return every identifier it walks past.
    expect(declared.has('renderHome')).toBe(false);
    expect(declared.has('countries')).toBe(false);
  });

  it('leaves no module outside state.ts holding shared game state', () => {
    const shared = new Set<string>(STORE_KEYS);
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC_ROOT)) {
      if (file.endsWith(join('src', 'app', 'state.ts'))) continue;
      for (const name of mutableDeclarations(readFileSync(file, 'utf8'))) {
        if (shared.has(name)) offenders.push(`${file.slice(SRC_ROOT.length + 1)}: let ${name}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps the view-local variables local, where they belong', () => {
    // The other half of the rule: extraction was supposed to move state, not
    // widen it. These three have never been read outside the atlas.
    const atlas = mutableDeclarations(readFileSync(join(SRC_ROOT, 'app/views/atlas.ts'), 'utf8'));
    expect(atlas).toEqual(['atlasCode', 'atlasQuery', 'atlasRegion']);
    expect(mutableDeclarations(readFileSync(join(SRC_ROOT, 'app/dialogs/audio-settings.ts'), 'utf8')))
      .toEqual(['musicPreviewSerial']);
  });
});
