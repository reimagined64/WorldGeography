/**
 * U14 — R8, stated the two ways it can be stated, over a whole playthrough.
 *
 * "The game is self-contained and asks the network for nothing" is the product
 * identity, and until now it was a claim about a *moment*: `readable-build.spec.ts`
 * and `obfuscated-build.spec.ts` each open the page and get as far as the first
 * question. A playthrough is where a fetch would actually hide — a flag image
 * for a country the first question did not use, a font that only the results
 * screen asks for, a source link a dialog resolves. So this plays a country
 * through, opens every screen the game has, and watches every request.
 *
 * It is also the backstop the plan names for RISK-2: a build-time dependency
 * that shipped an exfiltrating payload inside the obfuscated bundle, where
 * nobody will read it, still has to make a request to be worth anything.
 *
 * The claim is made twice because the two origins say different things.
 *
 *   * From `file://`, "no request begins with `http://` or `https://`" is
 *     exact and is v7's own wording. Nothing on the page has an origin to
 *     resolve a relative URL against, so any network traffic at all is
 *     absolute and is caught.
 *   * From `http://127.0.0.1`, the document itself is an `http://` request, so
 *     that wording would be meaningless. The claim becomes "nothing but this
 *     document" — which is the stronger one, because it also catches a
 *     relative URL that a `file://` page would have failed to resolve
 *     silently.
 *
 * And the published directory is checked for the shape the deploy depends on:
 * the licence files at the paths the game's own notices print, and `404.html`
 * answering an unknown path with a 404.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, assertSelfContained } from '../../scripts/build.ts';
import { DIST_DIR, DIST_OUTPUT } from '../../scripts/obfuscate.ts';
import * as Core from '../../src/engine/core.ts';
import { serveDirectory, type StaticSite } from '../helpers/static-server.ts';
import { answerWith, next, openGame, ready, state } from '../helpers/play.ts';
import { startOfCountry } from '../helpers/run-fixtures.ts';
import '../helpers/page-api.ts';

test.setTimeout(180_000);

const fileUrl = pathToFileURL(join(REPO_ROOT, DIST_OUTPUT)).href;

let site: StaticSite;

test.beforeAll(async () => {
  site = await serveDirectory(join(REPO_ROOT, DIST_DIR));
});

test.afterAll(async () => {
  await site.close();
});

interface Traffic {
  readonly requested: string[];
  readonly failures: string[];
}

/** Record every request the page makes and every error it throws. */
function watch(page: Page): Traffic {
  const requested: string[] = [];
  const failures: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  page.on('pageerror', (error) => failures.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });
  return { requested, failures };
}

/**
 * Play one country's five questions and walk every other screen.
 *
 * Breadth is the point rather than depth: a fetch hides on the screen nobody
 * opened, so the atlas, the three dialogs, the results and the review all get
 * opened once.
 */
async function playThrough(page: Page): Promise<void> {
  for (const category of Core.TYPES) {
    await ready(page);
    expect((await state(page))!.questions[(await state(page))!.index]!.type).toBe(category);
    await answerWith(page, false);
    if (category !== 'population') await next(page);
  }

  // Every other screen the game has, each rendered at least once.
  await page.locator('#nav-atlas').click();
  await expect(page.locator('#atlas-list .atlas-item').first()).toBeVisible();
  await page.locator('[data-country="JP"]').click();
  await expect(page.locator('#atlas-details h3')).not.toBeEmpty();

  for (const opener of ['#nav-help', '#data-button', '#sound-options'] as const) {
    await page.locator(opener).click();
    await expect(page.locator('#dialog')).toBeVisible();
    await page.locator('#dialog-close').click();
  }

  // The flag images live in the bundle, so the one screen that shows a flag
  // per country has to be reached rather than assumed.
  await page.locator('#nav-play').click();
  await expect(page.locator('#question-title')).toBeVisible();
}

test('asks the network for nothing at all, from file://', async ({ page }) => {
  const traffic = watch(page);
  await openGame(page, fileUrl, { run: startOfCountry() });
  await playThrough(page);

  // v7's wording, and from this origin it is exact.
  const external = traffic.requested.filter((url) => /^https?:\/\//.test(url));
  expect(external, `the page reached the network: ${external.join(', ')}`).toEqual([]);
  expect(traffic.requested).toEqual([fileUrl]);
  expect(traffic.failures).toEqual([]);
});

test('asks for nothing but its own document, from a real origin', async ({ page }) => {
  const traffic = watch(page);
  await openGame(page, site.url, { run: startOfCountry() });
  await playThrough(page);

  // Chromium asks any real origin for `/favicon.ico` on its own account; the
  // page never mentions one. That request is the browser's, not the game's,
  // and it is the only path besides the document the site is allowed to see.
  const fromPage = site.requested.filter((path) => path !== '/favicon.ico');
  expect(fromPage, `the site served more than the game: ${fromPage.join(', ')}`).toEqual(['/']);

  const offSite = traffic.requested.filter((url) => !url.startsWith(site.url.slice(0, -1)));
  expect(offSite, `the page left its own origin: ${offSite.join(', ')}`).toEqual([]);
  expect(traffic.failures).toEqual([]);
});

test('publishes the licence files at the paths the game prints', async ({ page }) => {
  // R26. The sources dialog tells the reader where to find the full texts; if
  // the site does not serve those paths the attribution the game prints is
  // false, and it is false in the one place nobody checks by playing.
  await page.goto(site.url);
  const notices = await page.locator('#license-data').textContent();
  const named = [...(notices ?? '').matchAll(/\blicenses\/([\w.-]+\.txt)\b/g)].map((m) => m[0]);
  expect(new Set(named).size).toBeGreaterThan(0);

  for (const path of [...new Set(named), 'LICENSE', 'THIRD_PARTY_NOTICES.txt']) {
    const response = await page.request.get(new URL(path, site.url).href);
    expect(response.status(), `${path} is not served`).toBe(200);
    expect((await response.text()).length, `${path} is empty`).toBeGreaterThan(200);
  }
});

test('answers an unknown path with 404.html, and that page is self-contained too', async ({ page }) => {
  const response = await page.goto(new URL('does-not-exist', site.url).href);

  expect(response?.status()).toBe(404);
  // Not a bare server message. `404.html` is what a visitor who followed a
  // stale link sees, it speaks both languages, and it carries one link back to
  // the game — a link that stays on this site, because a 404 page is exactly
  // where an absolute URL to somewhere else would never be noticed.
  await expect(page.locator('h1')).not.toBeEmpty();
  await expect(page.locator('p[lang="en"]')).toContainText('single file');
  const home = page.locator('main a');
  await expect(home).toHaveCount(1);
  await expect(home).toBeVisible();
  expect(await home.getAttribute('href')).toMatch(/^\/[\w-]*\/?$/);

  // R8 covers everything published, not only the game, so the second document
  // goes through the build's own rule rather than a second copy of it.
  assertSelfContained(readFileSync(join(REPO_ROOT, DIST_DIR, '404.html'), 'utf8'));
});
