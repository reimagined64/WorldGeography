/**
 * U16 — the three claims about the split views that need a real page.
 *
 * `tests/unit/views.test.ts` renders every screen into a register of stub
 * elements, which is enough to say what the markup contains and what the store
 * did, and not enough to say anything about focus, native button behaviour or
 * what is actually on `window`. Those three are here.
 *
 * Both saves are real: the keyboard test resumes the committed
 * `runs/mid-country.json` fixture rather than a payload this file invented, and
 * the duel test builds its save with the engine, because `isValidRun` replays
 * every stored answer and would reject anything hand-written.
 *
 * Out of `npm test` for the usual reason: a real Chromium and a twelve-second
 * arrival animation do not belong in a suite that runs on every save. Run with
 * `npx playwright test`; `npm run test:browser` is U14's to wire up.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, writeReadable } from '../../scripts/build.ts';
import * as Core from '../../src/engine/core.ts';
import { csQuestions } from '../../src/i18n/questions.cs.ts';
import type { LocalizedCountry, GameState } from '../../src/engine/types.ts';

/** Two twelve-second arrivals, plus a build and a launch. */
test.setTimeout(120_000);

interface DebugView {
  getState(): GameState | null;
  getView(): string;
  getStatus(): { phase: string; clock: { running: boolean } | null };
  version: string;
  edition: string;
}

const countries = JSON.parse(
  readFileSync(join(REPO_ROOT, 'data/build/countries.json'), 'utf8'),
) as LocalizedCountry[];

const MID_COUNTRY = readFileSync(
  join(REPO_ROOT, 'tests/fixtures/baseline/runs/mid-country.json'),
  'utf8',
);

/**
 * A duel stopped on the fifth and last question of the first player's country.
 *
 * Answering it hands the turn over, which is the one thing about two-player
 * mode a single screen cannot show. Wrong answers throughout: a correct one
 * scores, and ten thousand points would queue a flag bonus in between.
 */
function duelHandoverSave(): GameState {
  const game = Core.makeGame(
    countries,
    { players: 2, names: ['Alice', 'Bob'], difficulty: 'normal', region: 'all' },
    csQuestions,
    20260916,
  );
  for (let guard = 0; guard < 400; guard += 1) {
    const question = game.questions[game.index];
    if (question === undefined) break;
    if (question.type === 'population' && question.player === 0) {
      game.revealedIndex = game.index;
      game.clock = null;
      return game;
    }
    Core.submit(game, (question.correct + 1) % 3, 1000);
    if (game.gameOver || !Core.advance(game, countries, csQuestions)) break;
  }
  throw new Error('the simulated duel never reached the hand-over question');
}

let out: string;
let pageUrl: string;

test.beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), 'wg-views-'));
  const file = join(out, 'index.html');
  await writeReadable(undefined, file);
  pageUrl = pathToFileURL(file).href;
});

test.afterAll(() => {
  rmSync(out, { recursive: true, force: true });
});

/** Load with a run in the slot and the synthesizer switched off. */
async function openWithSave(page: Page, run: string): Promise<void> {
  await page.addInitScript(
    ([saved]) => {
      window.localStorage.setItem('wg.run.v7', saved!);
      window.localStorage.setItem('wg.audio.v2', JSON.stringify({ enabled: false }));
    },
    [run],
  );
  await page.goto(pageUrl);
}

const status = (page: Page): Promise<{ phase: string; clock: { running: boolean } | null }> =>
  page.evaluate(() => (window as unknown as { WorldGeography: DebugView }).WorldGeography.getStatus());

test('publishes the debug API and nothing else', async ({ page }) => {
  await page.goto(pageUrl);

  const globals = await page.evaluate((names: string[]) => ({
    // Named one by one rather than by prefix: Chromium ships `Geolocation`
    // and friends of its own, and "no global starting with Geo" would be a
    // claim about the browser instead of about this bundle.
    shim: names.filter((name) => name in window),
    api: Object.keys((window as unknown as { WorldGeography: DebugView }).WorldGeography).sort(),
    frozen: Object.isFrozen((window as unknown as { WorldGeography: DebugView }).WorldGeography),
  }), ['GeoCore', 'GeoClock', 'GeoAudio', 'GeoGlobe', 'GeoApp']);

  // The whole shim is gone. `WorldGeography` stays; it is the supported surface,
  // and since U14 it carries one member v7 did not — `getQuestionSet`, which is
  // how `golden-dist.spec.ts` reaches the engine inside the published bundle.
  expect(globals.shim).toEqual([]);
  expect(globals.api).toEqual([
    'edition', 'getQuestionSet', 'getState', 'getStatus', 'getView', 'version',
  ]);
  expect(globals.frozen).toBe(true);
});

test('moves the keyboard selection through the answers and submits it', async ({ page }) => {
  await openWithSave(page, MID_COUNTRY);

  await page.locator('#resume').click();
  // A resumed save always comes back paused, so the countdown is not running
  // at a player who is not looking at the screen yet.
  await expect(page.locator('#resume-clock')).toBeVisible();
  await page.locator('#resume-clock').click();
  await page.waitForFunction(
    () => (window as unknown as { WorldGeography: DebugView }).WorldGeography.getStatus().clock?.running === true,
    null,
    { timeout: 30_000 },
  );

  await expect(page.locator('[data-answer="0"]')).toHaveClass(/key-selected/);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-answer="1"]')).toHaveClass(/key-selected/);
  await expect(page.locator('[data-answer="1"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-answer="2"]')).toHaveClass(/key-selected/);
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-answer="1"]')).toHaveClass(/key-selected/);
  await expect(page.locator('[data-answer="0"]')).not.toHaveClass(/key-selected/);

  const index = (await page.evaluate(
    () => (window as unknown as { WorldGeography: DebugView }).WorldGeography.getState()?.index,
  )) as number;

  await page.keyboard.press('Enter');
  await expect(page.locator('#next')).toBeVisible();
  expect((await status(page)).phase).toBe('feedback');
  const answered = await page.evaluate(
    (at: number) => (window as unknown as { WorldGeography: DebugView }).WorldGeography.getState()?.answers[at]?.selected,
    index,
  );
  expect(answered).toBe(1);

  // The focus landed on "next", so the same key moves the run along.
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (at: number) => ((window as unknown as { WorldGeography: DebugView }).WorldGeography.getState()?.index ?? at) > at,
    index,
    { timeout: 30_000 },
  );
});

test('hands the turn to the second player in a duel', async ({ page }) => {
  const save = duelHandoverSave();
  await openWithSave(page, JSON.stringify(save));

  await page.locator('#resume').click();
  await expect(page.locator('.question-head strong')).toHaveText('Na tahu: Alice');
  await page.waitForFunction(
    () => (window as unknown as { WorldGeography: DebugView }).WorldGeography.getStatus().clock?.running === true,
    null,
    { timeout: 30_000 },
  );

  const wrong = await page.evaluate(() => {
    const game = (window as unknown as { WorldGeography: DebugView }).WorldGeography.getState()!;
    return (game.questions[game.index]!.correct + 1) % 3;
  });
  await page.locator(`[data-answer="${String(wrong)}"]`).click();
  await expect(page.locator('#next')).toBeVisible();
  // The label on the button is the hand-over, before the flight even starts.
  await expect(page.locator('#next')).toContainText('Předat tah');

  await page.locator('#next').click();
  await expect(page.locator('#flight-status')).toBeVisible();
  expect((await status(page)).phase).toBe('flying');

  await page.waitForFunction(
    () => (window as unknown as { WorldGeography: DebugView }).WorldGeography.getStatus().phase === 'question',
    null,
    { timeout: 60_000 },
  );
  await expect(page.locator('.question-head strong')).toHaveText('Na tahu: Bob');
  await expect(page.locator('.score-chip.active .player-name')).toHaveText('Bob');
});
