/**
 * U15 — the readable build, opened the way a player opens it.
 *
 * R8 says the game works from `file://` with nothing to fetch. Only a browser
 * can answer that: a Node suite can prove the document contains no external
 * reference, but not that Chromium asks for nothing and still gets as far as a
 * playable question. So this spec builds, opens the file, and plays.
 *
 * It is deliberately out of `npm test`: a real Chromium plus the game's
 * twelve-second arrival animation is a minute-scale cost that does not belong
 * in a suite that runs on every save. `npm run test:browser` is U14's to wire
 * up; until then this runs under `npx playwright test`.
 */
import { expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeReadable } from '../../scripts/build.ts';

/**
 * The page's own test surface, frozen onto `window` during boot. Narrow on
 * purpose — only what this spec reads, so a rename fails a typecheck instead
 * of silently returning `undefined` inside the browser.
 */
declare global {
  interface Window {
    WorldGeography?: {
      getStatus(): {
        phase: string;
        clock: { elapsedMs: number; remainingMs: number; running: boolean } | null;
      };
    };
  }
}

/** The arrival flight is 12 s of the game's own design, plus build and launch. */
test.setTimeout(90_000);

let out: string;
let pageUrl: string;

test.beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), 'wg-file-'));
  const file = join(out, 'index.html');
  await writeReadable(undefined, file);
  pageUrl = pathToFileURL(file).href;
});

test.afterAll(() => {
  rmSync(out, { recursive: true, force: true });
});

test('opens from file:// and reaches a playable first question', async ({ page }) => {
  const requested: string[] = [];
  const failures: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  page.on('pageerror', (error) => failures.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });

  await page.goto(pageUrl);
  await expect(page.locator('#start')).toBeVisible();

  await page.locator('#start').click();
  // The clock starts a paint after the question renders, so waiting on the
  // phase alone would sample the state one frame too early.
  await page.waitForFunction(
    () => {
      const status = window.WorldGeography?.getStatus();
      return status?.phase === 'question' && status.clock?.running === true;
    },
    null,
    { timeout: 60_000 },
  );

  // Playable means more than "rendered": a question, its three answers, and a
  // clock that is actually counting down against the player.
  await expect(page.locator('#question-title')).not.toBeEmpty();
  await expect(page.locator('.answer-list button.answer')).toHaveCount(3);

  const status = await page.evaluate(() => window.WorldGeography?.getStatus());
  expect(status?.phase).toBe('question');
  expect(status?.clock?.running).toBe(true);
  expect(status?.clock?.remainingMs).toBeGreaterThan(0);

  // The offline claim, stated the only way a browser can state it.
  expect(requested).toEqual([pageUrl]);
  expect(failures).toEqual([]);
});
