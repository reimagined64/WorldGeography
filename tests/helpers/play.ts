/**
 * The setup `browser.test.py` and `final-ui.test.py` shared, ported once.
 *
 * Both Python suites opened with the same six lines — install a storage shim,
 * set the content, assert the version, define `ready`/`answer`/`q` — and then
 * diverged. Two ports of those six lines would drift; this is the one.
 *
 * Three things are different here, and each is an improvement the port made
 * possible rather than a workaround:
 *
 *   * **Storage is real.** v7's suites could not navigate to a URL at all in
 *     their sandbox, so they replaced `window.localStorage` with an object
 *     literal and wrote "Not verified" into their own results file. The site is
 *     served over `http://127.0.0.1` here, so the save goes into the browser's
 *     own storage and the reload that reads it back is a real reload.
 *   * **The clock is Playwright's.** `page.clock.install` fakes `Date`,
 *     `setTimeout`, `performance` *and* `requestAnimationFrame`, which is what
 *     lets `runFor` drive the twelve-second arrival in about seven seconds of
 *     real time and makes the per-question countdown exact instead of racy.
 *   * **The run is built outside.** `tests/helpers/run-fixtures.ts` builds the
 *     save with the engine; U16 removed the `GeoCore` global the Python suites
 *     reached for.
 *
 * Nothing here asserts. A helper that assumes what a test is about is a helper
 * that quietly weakens it, so `ready` and `answerWith` return what they found
 * and the spec says what it means.
 */
import { expect, type Page } from '@playwright/test';
import type { AudioPreferences } from '../../src/audio/audio.ts';
import type { AnswerResult, GameState, Locale, Question } from '../../src/engine/types.ts';
import type { DebugStatus, View } from '../../src/app/state.ts';
import { STORE } from '../../src/app/storage.ts';
import './page-api.ts';

/**
 * The instant every run starts from.
 *
 * Fixed rather than "now" so that a save's `created` stamp, the record's date
 * and anything else the game writes are the same on every run and on every
 * machine. It is v7's own test date.
 */
const FIXED_TIME = '2026-09-07T10:00:00Z';

/** The 12 s arrival, plus the margin that lets `onComplete` run. */
const FLIGHT_MS = 12_500;

/** One paint plus the timeout `startClock` arms; 180 ms was v7's number. */
const CLOCK_START_MS = 200;

export interface OpenOptions {
  /** The run to put in `wg.run.v7` before the page boots. */
  readonly run?: GameState | null;
  /** Written into `wg.settings.v1`, which is what pins the shell's language. */
  readonly lang?: Locale;
  /**
   * Audio preferences. Off by default: the synthesizer is real, and twenty-one
   * voices of `AudioContext` are a cost every spec would otherwise pay for the
   * two that are about sound.
   */
  readonly audio?: Partial<AudioPreferences>;
  /** `false` leaves the browser's own clock alone, for a real-time render check. */
  readonly clock?: boolean;
  /** Resume the stored run, and its paused question clock with it. */
  readonly resume?: boolean;
}

/** Marks the tab as already seeded. Not a key the game knows or reads. */
const SEEDED = 'wg.test.seeded';

/**
 * Seed storage, install the clock, and open the page.
 *
 * The storage writes go in through `addInitScript` so they land before the
 * bundle's first line — `boot()` reads `wg.settings.v1` before it reads
 * anything else, and a language written after boot is a different test.
 *
 * And they happen **once per tab**, not once per navigation, which is the
 * whole reason this helper exists rather than three lines in each spec.
 * `addInitScript` runs again on every document, so an unguarded version would
 * put the original fixture back on every `page.reload()` — and a reload is
 * precisely what the specs here use to ask whether the *browser* kept what the
 * page wrote. The test would pass while proving the opposite of its name.
 */
export async function openGame(page: Page, url: string, o: OpenOptions = {}): Promise<void> {
  const entries: Record<string, string> = {};
  if (o.run !== undefined) entries[STORE.run] = JSON.stringify(o.run);
  if (o.lang !== undefined) entries[STORE.settings] = JSON.stringify({ lang: o.lang, schemaVersion: 1 });
  entries[STORE.audio] = JSON.stringify({ enabled: false, ...o.audio, schemaVersion: 1 });

  if (o.clock !== false) await page.clock.install({ time: new Date(FIXED_TIME) });
  await page.addInitScript(([stored, seeded]) => {
    if (window.sessionStorage.getItem(seeded as string) !== null) return;
    window.sessionStorage.setItem(seeded as string, '1');
    for (const [key, value] of Object.entries(stored as Record<string, string>)) {
      window.localStorage.setItem(key, value);
    }
  }, [entries, SEEDED] as const);

  await page.goto(url);
  // The home screen always offers a new run; a resumable one adds a second
  // button above it. Waiting on `#start` is therefore waiting on "the shell
  // has booted and rendered", whichever of the two cases this is.
  await expect(page.locator('#start')).toBeVisible();

  if (o.resume ?? o.run != null) {
    await page.locator('#resume').click();
    // A save carrying a paused clock lands on the resume prompt rather than on
    // a running question; the player's own click is what starts it again.
    if (await page.locator('#resume-clock').count()) await page.locator('#resume-clock').click();
  }
}

export const state = (page: Page): Promise<GameState | null> =>
  page.evaluate(() => window.WorldGeography!.getState());

export const status = (page: Page): Promise<DebugStatus> =>
  page.evaluate(() => window.WorldGeography!.getStatus());

export const view = (page: Page): Promise<View> =>
  page.evaluate(() => window.WorldGeography!.getView());

/** The question currently on screen. */
export async function question(page: Page): Promise<Question> {
  const game = await state(page);
  if (game === null) throw new Error('no game is running');
  const current = game.questions[game.index];
  if (current === undefined) throw new Error(`no question at index ${String(game.index)}`);
  return current;
}

/**
 * Advance the fake clock until a question is on screen with its clock running.
 *
 * Both waits are needed and neither is a guess: a run resumed mid-arrival has
 * twelve seconds of choreography to finish, and a question that has just
 * rendered starts its countdown a paint later. `ready` is the port of v7's
 * function of the same name, including its final assertion — a spec that calls
 * this and then measures something has to know the measurement started.
 */
export async function ready(page: Page): Promise<DebugStatus> {
  if ((await status(page)).phase === 'flying') await page.clock.runFor(FLIGHT_MS);
  let current = await status(page);
  if (current.phase === 'question' && current.clock?.running !== true) {
    await page.clock.runFor(CLOCK_START_MS);
    current = await status(page);
  }
  expect(current.phase, `expected a running question, got ${JSON.stringify(current.phase)}`).toBe('question');
  expect(current.clock?.running).toBe(true);
  return current;
}

/**
 * Answer the question on screen through the DOM, and hand back what it scored.
 *
 * Deliberately a click on `[data-answer]` rather than a call into the engine:
 * everything this suite exists to check — that the ledger the *page* keeps
 * matches the ledger the engine keeps — is downstream of that click.
 */
export async function answerWith(page: Page, correct: boolean): Promise<AnswerResult> {
  const game = await state(page);
  if (game === null) throw new Error('no game is running');
  const current = game.questions[game.index];
  if (current === undefined) throw new Error('no question to answer');

  const choice = correct ? current.correct : (current.correct + 1) % 3;
  await page.locator(`[data-answer="${String(choice)}"]`).click();

  const after = await state(page);
  const result = after?.answers[game.index];
  if (result === undefined) throw new Error('the click did not produce an answer');
  expect(result.correct).toBe(correct);
  return result;
}

/** Click through to the next question, whatever the button currently says. */
export async function next(page: Page): Promise<void> {
  await page.locator('#next').click();
}

/** What one frame of the globe canvas contains. */
export interface GlobeSample {
  readonly width: number;
  readonly height: number;
  /** Pixels with any alpha, as a fraction of the canvas. */
  readonly covered: number;
  /** Where those pixels average out, as fractions of width and height. */
  readonly centre: { x: number; y: number } | null;
  /** Pixels in the highlight colour the target country and its marker are drawn in. */
  readonly target: number;
  readonly targetCentre: { x: number; y: number } | null;
  /** Alpha at the four canvas corners. */
  readonly corners: number[];
}

/**
 * Read the globe canvas and describe what is on it.
 *
 * `final-ui.test.py` counted pixels with any alpha and asserted the count was
 * over a hundred thousand. Two things are wrong with that. A globe drawn
 * upside down, mirrored or centred on the wrong ocean paints exactly as many
 * pixels, so the floor passes on a picture that is wrong in every way a
 * picture can be; and at the zoom the game uses for a question the disc covers
 * the whole canvas, so the count is simply the canvas and says nothing at all.
 *
 * What is measured instead is shape and position. `covered` and `centre`
 * describe the disc — at zoom 1 it is a little under two thirds of the canvas,
 * centred on `(0.5, 0.51)` because `draw` puts `cy` at `h * .51`. `target`
 * counts the warm highlight `draw` reserves for the country in play and for
 * its marker: nothing else on the canvas is reddish, the sea is `#21454b` and
 * the land runs green, so the test is `r` clearly ahead of `g` and `b`. Its
 * centroid is the useful one — the camera is pointed at that country, so the
 * highlight belongs in the middle of the frame.
 *
 * The scan runs *inside* the wait rather than after it, and that is not a
 * tidiness choice. Setting `canvas.width` clears the bitmap, `resize()` does
 * exactly that whenever the `ResizeObserver` fires, and the globe repaints on
 * its own thirty-millisecond schedule afterwards. A helper that waited for a
 * painted frame and then sampled in a second round trip reads an empty canvas
 * whenever a re-render resizes it in between — which is a flake, and one that
 * looks exactly like the bug the test is for.
 */
const SAMPLE_GLOBE = (): GlobeSample | null => {
  const canvas = document.getElementById('globe') as HTMLCanvasElement | null;
  if (canvas === null || canvas.width === 0) return null;
  const { data, width, height } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  let covered = 0, cx = 0, cy = 0, target = 0, tx = 0, ty = 0;
  for (let i = 0; i < data.length; i += 4) {
    const pixel = i / 4, x = pixel % width, y = (pixel - x) / width;
    if (data[i + 3]! > 8) { covered += 1; cx += x; cy += y; }
    if (data[i + 3]! > 200 && data[i]! > 150 && data[i]! > data[i + 1]! + 30 && data[i + 1]! >= data[i + 2]!) {
      target += 1; tx += x; ty += y;
    }
  }
  const at = (sx: number, sy: number, n: number): { x: number; y: number } | null =>
    n === 0 ? null : { x: sx / n / width, y: sy / n / height };
  const alphaAt = (x: number, y: number): number => data[(y * width + x) * 4 + 3]!;
  // A stray pixel is not a frame. At zoom 1 the disc covers about 58% of the
  // canvas and at question zoom the atmospheric glow covers all of it, so a
  // fifth is comfortably below either and far above nothing.
  if (covered / (width * height) < 0.2) return null;
  return {
    width, height,
    covered: covered / (width * height),
    centre: at(cx, cy, covered),
    target,
    targetCentre: at(tx, ty, target),
    corners: [alphaAt(0, 0), alphaAt(width - 1, 0), alphaAt(0, height - 1), alphaAt(width - 1, height - 1)],
  };
};

/** Wait for a painted frame of the globe, and hand back that frame. */
export async function globeDrawn(page: Page): Promise<GlobeSample> {
  // `waitForFunction` resolves only on a truthy value, so the handle holds a
  // sample; the cast is what says so, since its type is the function's return
  // type including the `null` it polls through.
  const handle = await page.waitForFunction(SAMPLE_GLOBE, null, { timeout: 30_000, polling: 100 });
  return (await handle.jsonValue()) as GlobeSample;
}
