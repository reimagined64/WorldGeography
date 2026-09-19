/**
 * U14 — saved runs, over an origin that has somewhere to save them.
 *
 * This is the file v7 could not write. `browser.test.py` ends with a sentence
 * in its own results JSON: *"Not verified: this environment blocks file:// and
 * local HTTP navigation by administrator policy; save/restore scenarios use a
 * controlled storage shim."* Every save and resume it checked went through an
 * object literal it had installed over `window.localStorage` a moment earlier,
 * so the one thing the storage layer has to do — survive the page being closed
 * — was the one thing never tested.
 *
 * The published directory is served over `http://127.0.0.1` here, which gives
 * the document a real origin. The saves below go into Chromium's own storage,
 * the reloads are real reloads, and the payload the page reads back is the
 * payload the page wrote.
 *
 * It runs against `dist/` rather than the readable build on purpose. Storage is
 * where a player's history lives: if `selfDefending` or the string table ever
 * mangled a key name, a deploy would silently orphan every saved run, and the
 * readable build would never show it.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../scripts/build.ts';
import { DIST_DIR } from '../../scripts/obfuscate.ts';
import { STORE } from '../../src/app/storage.ts';
import type { GameState } from '../../src/engine/types.ts';
import { cs } from '../../src/i18n/cs.ts';
import { csQuestions } from '../../src/i18n/questions.cs.ts';
import { enQuestions } from '../../src/i18n/questions.en.ts';
import { serveDirectory, type StaticSite } from '../helpers/static-server.ts';
import { answerWith, next, openGame, question, ready, state } from '../helpers/play.ts';
import { beforeMilestone, lastAffordableCountry } from '../helpers/run-fixtures.ts';
import '../helpers/page-api.ts';

test.setTimeout(180_000);

/**
 * Two runs real players of the shipped v7 build left behind.
 *
 * Captured from the browser, not written here, and neither carries `lang` — the
 * field did not exist when they were saved. RISK-8 is that such a run is
 * rejected after deploy; KTD13 is the promise that it is migrated instead.
 * These are the payloads both are about.
 *
 * `mid-flight` was saved during an arrival, so resuming it replays the
 * twelve-second choreography before the question appears; `mid-country` was
 * saved on a question and resumes straight onto it.
 */
const v7Save = (name: string): GameState =>
  JSON.parse(readFileSync(join(REPO_ROOT, `tests/fixtures/baseline/runs/${name}.json`), 'utf8')) as GameState;

let site: StaticSite;

test.beforeAll(async () => {
  site = await serveDirectory(join(REPO_ROOT, DIST_DIR));
});

test.afterAll(async () => {
  await site.close();
});

const stored = (page: Page, key: string): Promise<string | null> =>
  page.evaluate((name: string) => window.localStorage.getItem(name), key);

test('writes a run into the browser and reads it back after a real reload', async ({ page }) => {
  await openGame(page, site.url, { run: beforeMilestone() });
  await ready(page);

  const before = await state(page);
  const answer = await answerWith(page, true);
  expect(answer.scoreLifeDelta).toBe(2);

  const after = await state(page);
  expect(after!.scores[0]).toBeGreaterThan(before!.scores[0]!);

  // The page wrote this; nothing in the test did. A shim would make the next
  // three lines a tautology, which is exactly what v7's suite could not avoid.
  const saved = await stored(page, STORE.run);
  expect(JSON.parse(saved ?? 'null')).toMatchObject({
    index: after!.index,
    scores: after!.scores,
    lives: after!.lives,
  });

  await page.reload();
  await expect(page.locator('#resume')).toBeVisible();
  await page.locator('#resume').click();
  if (await page.locator('#resume-clock').count()) await page.locator('#resume-clock').click();

  const resumed = await state(page);
  expect(resumed).toMatchObject({
    index: after!.index,
    scores: after!.scores,
    lives: after!.lives,
    pendingBonuses: after!.pendingBonuses,
  });
  // A resumed clock always comes back paused and then restarted by the
  // player's click, so it is the ledger that has to match, not the countdown.
  expect((await question(page)).prompt).toBe(after!.questions[after!.index]!.prompt);
});

test('clears the run slot and writes the record when the run ends', async ({ page }) => {
  await openGame(page, site.url, { run: lastAffordableCountry() });

  // Five wrong answers on the last country the run can pay for: the entry cost
  // was prepaid, so none of them costs anything and the fifth ends the game.
  for (let i = 0; i < 5; i += 1) {
    await ready(page);
    const answer = await answerWith(page, false);
    expect(answer.lifeDelta).toBe(0);
    await next(page);
  }

  await expect(page.locator('#results-view')).toBeVisible();

  expect(await stored(page, STORE.run)).toBe('null');
  expect(JSON.parse((await stored(page, STORE.record)) ?? 'null')).toMatchObject({ schemaVersion: 1 });

  // And it is still gone after a reload, rather than only in the tab that
  // finished it.
  await page.reload();
  await expect(page.locator('#start')).toBeVisible();
  await expect(page.locator('#resume')).toHaveCount(0);
});

test('keeps the sound settings the player chose, across a reload', async ({ page }) => {
  await openGame(page, site.url, { audio: { enabled: true } });

  await page.locator('#sound-options').click();
  await page.locator('#audio-volume').fill('30');
  await expect(page.locator('#volume-label')).toHaveText('30 %');
  await page.locator('#dialog-close').click();

  await page.reload();
  await page.locator('#sound-options').click();
  await expect(page.locator('#volume-label')).toHaveText('30 %');
  expect(JSON.parse((await stored(page, STORE.audio)) ?? 'null')).toMatchObject({ volume: 0.3 });
});

/**
 * KTD13 and RISK-8, on the profile that makes them matter.
 *
 * An English-speaking browser with a Czech run in storage is the only
 * configuration in which the migration is observable: the shell would open in
 * English, and the run's questions are Czech text baked in before the field
 * that records that existed. The rule is that the *run* wins and the session
 * follows it — visibly, and only until the run is over.
 */
test.describe('a run saved by the shipped v7 build', () => {
  test.use({ locale: 'en-GB' });

  test('resumes as Czech and pins the session, on an English-only profile', async ({ page }) => {
    // No `wg.settings.v1`: the player never chose a language, so detection runs
    // and would give English. Passing `lang` here would make the test prove
    // nothing.
    await openGame(page, site.url, { run: v7Save('mid-flight'), resume: false });

    // Boot read the save, found no `lang`, migrated it to Czech and followed it.
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
    await expect(page.locator('#nav-play')).toHaveText(cs['chrome.navPlay']);

    await page.locator('#resume').click();
    if (await page.locator('#resume-clock').count()) await page.locator('#resume-clock').click();
    await ready(page);

    const game = await state(page);
    expect(game).not.toBeNull();
    // Migrated in memory, and the text on screen is the Czech the run was
    // written in — v7's wording, not today's catalog's.
    expect(game!.lang).toBe('cs');
    await expect(page.locator('#question-title')).toHaveText(game!.questions[game!.index]!.prompt);
    // Czech on an English profile, which is the whole of KTD13 in one string:
    // the question on screen is the text the run was written with, and the
    // English rendering of the same prompt is nowhere near it.
    expect(game!.questions[game!.index]!.prompt).toBe(csQuestions.prompts.country);
    await expect(page.locator('#question-title')).not.toHaveText(enQuestions.prompts.country);

    // Pinned: the switcher is locked while the run is on screen, and says why.
    await expect(page.locator('#language')).toBeDisabled();
    await expect(page.locator('#language')).toHaveAttribute('title', cs['language.lockedDuringRun']);

    // And released the moment the player leaves it, with the run intact.
    await page.locator('#back-home').click();
    await expect(page.locator('#language')).toBeEnabled();
    await expect(page.locator('#resume')).toBeVisible();
  });

  test('is still a valid save after the page has written it back', async ({ page }) => {
    await openGame(page, site.url, { run: v7Save('mid-country'), resume: false });
    await page.locator('#resume').click();
    if (await page.locator('#resume-clock').count()) await page.locator('#resume-clock').click();
    await ready(page);

    // The migration is in memory; the first write puts `lang` on disk. What
    // matters is that the rewritten payload is one the next boot accepts —
    // a migration that produced an invalid save would lose the run on the
    // reload rather than on the deploy, which is worse, not better.
    await answerWith(page, false);
    const rewritten = JSON.parse((await stored(page, STORE.run)) ?? 'null') as { lang?: string };
    expect(rewritten.lang).toBe('cs');

    await page.reload();
    await expect(page.locator('#resume')).toBeVisible();
    await page.locator('#resume').click();
    if (await page.locator('#resume-clock').count()) await page.locator('#resume-clock').click();
    expect((await state(page))!.lang).toBe('cs');
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  });
});
