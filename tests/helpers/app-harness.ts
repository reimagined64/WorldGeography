/**
 * A page thin enough to render into from Node, and the two instruments the
 * views reach for that a Node process does not have.
 *
 * The alternative was a browser for every claim in `tests/unit/views.test.ts`,
 * and the claims that matter most there are the ones a browser is worst at
 * stating: that a callback retained from a cancelled flight does nothing when it
 * finally fires. A real globe never fires one — `cancelFlight` drops it first —
 * so a browser can only observe that the belt held, never that the braces work.
 * `FakeGlobe` keeps every reveal it was ever handed, which is what lets a test
 * fire a stale callback deliberately and watch the token refuse it.
 *
 * The DOM is a register, not an implementation: elements exist on demand, hold
 * what was written into them, and answer selectors only with what a test
 * registered. That is enough for "which screen is on the page and what does it
 * say", which is all these tests ask. Anything that needs layout, parsing or
 * real events belongs in `tests/browser/`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Country } from '../../src/engine/types.ts';
import type { FlightState, RevealOptions } from '../../src/globe/globe.ts';
import { installDatabase, type Database } from '../../src/app/database.ts';
import { store, type Store } from '../../src/app/state.ts';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

class StubClassList {
  readonly names: Set<string>;
  constructor(names: Set<string>) { this.names = names; }
  add(...names: string[]): void { for (const name of names) this.names.add(name); }
  remove(...names: string[]): void { for (const name of names) this.names.delete(name); }
  contains(name: string): boolean { return this.names.has(name); }
  toggle(name: string, force?: boolean): boolean {
    const on = force ?? !this.names.has(name);
    if (on) this.names.add(name); else this.names.delete(name);
    return on;
  }
}

export class StubElement {
  innerHTML = '';
  textContent: string | null = '';
  hidden = false;
  title = '';
  value = '';
  disabled = false;
  open = false;
  tagName = 'DIV';
  clicks = 0;
  focuses = 0;
  onclick: ((...args: unknown[]) => unknown) | null = null;
  onchange: ((...args: unknown[]) => unknown) | null = null;
  oninput: ((...args: unknown[]) => unknown) | null = null;
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly names = new Set<string>();
  readonly classList = new StubClassList(this.names);
  readonly id: string;

  constructor(id: string) { this.id = id; }

  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  focus(): void { this.focuses += 1; }
  click(): void { this.clicks += 1; this.onclick?.(); }
  scrollIntoView(): void {}
  showModal(): void { this.open = true; }
  close(): void { this.open = false; }
  addEventListener(): void {}
  getBoundingClientRect(): DOMRect { return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect; }
  querySelectorAll(): StubElement[] { return []; }
}

export interface DomStub {
  /** Every element the page has been asked for, by id. */
  el(id: string): StubElement;
  /** What `document.querySelectorAll` should answer for one selector. */
  register(selector: string, elements: StubElement[]): void;
  /** Run the animation frames queued so far, and only those. */
  flushFrames(): void;
  /** Resolve the promise chain and the two frames `startClockAfterPaint` waits. */
  settleClockStart(): Promise<void>;
  readonly storage: Map<string, string>;
  readonly listeners: Map<string, ((event: unknown) => void)[]>;
  restore(): void;
}

const GLOBALS = ['document', 'window', 'innerWidth', 'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;

export function installDom(): DomStub {
  const elements = new Map<string, StubElement>();
  const selectors = new Map<string, StubElement[]>();
  const storage = new Map<string, string>();
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const frames = new Map<number, (time: number) => void>();
  let nextFrame = 1;

  const el = (id: string): StubElement => {
    const found = elements.get(id);
    if (found !== undefined) return found;
    const made = new StubElement(id);
    elements.set(id, made);
    return made;
  };

  const body = new StubElement('body');
  const document = {
    hidden: false,
    body,
    getElementById: (id: string): StubElement => el(id),
    querySelectorAll: (selector: string): StubElement[] => selectors.get(selector) ?? [],
    querySelector: (selector: string): StubElement | null => selectors.get(selector)?.[0] ?? null,
    addEventListener: (type: string, handler: (event: unknown) => void): void => {
      listeners.set(type, [...(listeners.get(type) ?? []), handler]);
    },
  };

  const before = new Map<string, unknown>();
  for (const name of GLOBALS) before.set(name, (globalThis as Record<string, unknown>)[name]);

  const globals = globalThis as unknown as Record<string, unknown>;
  globals['document'] = document;
  globals['window'] = { scrollTo: (): void => {}, addEventListener: (): void => {} };
  globals['innerWidth'] = 1280;
  globals['localStorage'] = {
    getItem: (key: string): string | null => storage.get(key) ?? null,
    setItem: (key: string, value: string): void => { storage.set(key, value); },
    removeItem: (key: string): void => { storage.delete(key); },
    clear: (): void => { storage.clear(); },
  };
  globals['requestAnimationFrame'] = (callback: (time: number) => void): number => {
    const handle = nextFrame; nextFrame += 1; frames.set(handle, callback); return handle;
  };
  globals['cancelAnimationFrame'] = (handle: number): void => { frames.delete(handle); };

  const flushFrames = (): void => {
    const due = [...frames.entries()];
    frames.clear();
    for (const [, callback] of due) callback(performance.now());
  };

  return {
    el,
    register: (selector, list) => { selectors.set(selector, list); },
    flushFrames,
    settleClockStart: async (): Promise<void> => {
      // `Promise.all(...).then(rAF(rAF(start)))`: one microtask, then two frames.
      await Promise.resolve();
      await Promise.resolve();
      flushFrames();
      flushFrames();
    },
    storage,
    listeners,
    restore: () => {
      for (const [name, value] of before) {
        if (value === undefined) delete globals[name];
        else globals[name] = value;
      }
    },
  };
}

/* ------------------------------------------------------------------ *
 * The globe and the synthesizer
 * ------------------------------------------------------------------ */

/** One `reveal` call, kept after cancellation so a test can fire it late. */
export interface CapturedFlight {
  country: Country;
  neutral: boolean;
  onStage: (stage: string) => void;
  onProgress: (state: FlightState) => void;
  onComplete: () => void;
}

export class FakeGlobe {
  lat = 0;
  lon = 0;
  zoom = 1;
  targetZoom = 1;
  locked = false;
  motion = true;
  flight: CapturedFlight | null = null;
  /** Every reveal ever started, cancelled ones included. */
  readonly flights: CapturedFlight[] = [];
  readonly presented: (Country | null)[] = [];

  home(): void { this.flight = null; }
  focus(): void {}
  reset(): void {}
  setZoom(z: number): void { this.targetZoom = z; }
  setMotion(enabled: boolean): void { this.motion = enabled; }
  present(c: Country | null): void { this.presented.push(c); }
  pauseFlight(): void {}
  cancelFlight(): void { this.flight = null; }
  flightState(): FlightState | null { return null; }
  reveal(c: Country, options: RevealOptions = {}): void {
    this.cancelFlight();
    const flight: CapturedFlight = {
      country: c,
      neutral: options.neutral === true,
      onStage: options.onStage ?? ((): void => {}),
      onProgress: options.onProgress ?? ((): void => {}),
      onComplete: options.onComplete ?? ((): void => {}),
    };
    this.flight = flight;
    this.flights.push(flight);
  }
}

export class FakeAudio {
  enabled = false;
  music = true;
  effects = true;
  volume = 0.5;
  unlocked = true;
  paused = false;
  failed = false;
  scene = 'home';
  onChange: (() => void) | undefined;
  readonly cues: string[] = [];
  readonly scenes: string[] = [];

  unlock(): Promise<boolean> { return Promise.resolve(true); }
  configure(): void {}
  settings(): Record<string, unknown> { return { enabled: this.enabled, music: this.music, effects: this.effects, volume: this.volume }; }
  setPaused(value: boolean): void { this.paused = value; }
  setScene(scene: string): void { this.scene = scene; this.scenes.push(scene); }
  setRegion(): void {}
  cue(kind: string): void { this.cues.push(kind); }
  beginQuestion(): boolean { return true; }
  stopVoices(): void {}
  status(): Record<string, unknown> { return { enabled: this.enabled, scene: this.scene, notes: 0 }; }
}

/** A frame of flight progress, with the fields a caller cares about overridden. */
export function flightProgress(overrides: Partial<FlightState> = {}): FlightState {
  return { stage: 'spin', elapsed: 4000, paused: false, progress: 0.33, remainingMs: 8000, durationMs: 12000, turnsCompleted: 1, motion: true, neutral: false, ...overrides };
}

/* ------------------------------------------------------------------ *
 * The whole harness
 * ------------------------------------------------------------------ */

let database: Database | undefined;

/** The real `data/build/` files, read once for the whole suite. */
export function realDatabase(): Database {
  if (database !== undefined) return database;
  const read = <T>(name: string): T => JSON.parse(readFileSync(join(REPO_ROOT, 'data/build', name), 'utf8')) as T;
  const countries = read<Country[]>('countries.json');
  database = {
    countries,
    byCode: Object.fromEntries(countries.map((c) => [c.code, c])),
    flags: read<Record<string, string>>('flags.json'),
    sources: read<Database['sources']>('sources.json'),
    licenseText: 'MIT License',
  };
  return database;
}

export interface Harness extends DomStub {
  readonly globe: FakeGlobe;
  readonly audio: FakeAudio;
  readonly countries: Country[];
  readonly byCode: Readonly<Record<string, Country>>;
}

const PRISTINE = { ...store };

/**
 * Install the page, the database and the two fakes, and hand the store back to
 * its starting values afterwards. The store is a module singleton, so a test
 * that left `phase` behind would be a test the next one silently depends on.
 */
export function installApp(): Harness {
  const dom = installDom();
  const db = realDatabase();
  installDatabase(db);

  const globe = new FakeGlobe();
  const audio = new FakeAudio();
  Object.assign(store, PRISTINE);
  // `options` is mutated in place by the setup panel, so a shared copy would
  // carry one test's player names into the next.
  store.options = { ...PRISTINE.options, names: [...PRISTINE.options.names] };
  store.globe = globe as unknown as Store['globe'];
  store.audio = audio as unknown as Store['audio'];

  const restore = dom.restore;
  return Object.assign(dom, {
    globe,
    audio,
    countries: db.countries,
    byCode: db.byCode,
    restore: (): void => {
      Object.assign(store, PRISTINE);
      store.options = { ...PRISTINE.options, names: [...PRISTINE.options.names] };
      restore();
    },
  });
}
