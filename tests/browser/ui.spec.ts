/**
 * U14 — `final-ui.test.py`, ported: the shipped page rendering in real time.
 *
 * Everything in `game.spec.ts` runs on Playwright's fake clock, which is what
 * makes it fast and exact. That is also its blind spot: a fake `requestAnimationFrame`
 * fires because a test asked it to, so a globe that never painted, a layout
 * that only settles on a real frame, or a transition that the browser's own
 * scheduler drives would all go unnoticed. v7 kept a second, smaller suite for
 * exactly this reason and so does this one — no clock installed, nothing
 * advanced by hand, the browser's own timing throughout.
 *
 * Two things are tightened against the original.
 *
 * The canvas check was `nonempty > 100000`, and it does not survive contact
 * with the thing it was checking. At the zoom a question uses, the globe's
 * atmospheric glow covers the whole canvas, so that count *is* the canvas and
 * carries no information; at zoom 1 it passes on a disc drawn in the wrong
 * place, at the wrong size, or with nothing on it. What is measured here is
 * shape and position instead — the disc's extent and centre at zoom 1, and the
 * highlighted country's own colour sitting where the camera was pointed after
 * a flight. `globeDrawn` in `tests/helpers/play.ts` carries the detail.
 *
 * And the mobile checks run on a real mobile context: v7's `is_mobile`/
 * `has_touch` pair, which changes hit-testing and the viewport meta handling,
 * rather than a desktop window resized to 390 px.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { join } from 'node:path';
import { REPO_ROOT } from '../../scripts/build.ts';
import { DIST_DIR } from '../../scripts/obfuscate.ts';
import * as Core from '../../src/engine/core.ts';
import { t } from '../../src/i18n/index.ts';
import { serveDirectory, type StaticSite } from '../helpers/static-server.ts';
import { answerWith, globeDrawn, openGame, question, state, status } from '../helpers/play.ts';
import { beforeMilestone, byCode, onFlagBonus, startOfCountry } from '../helpers/run-fixtures.ts';
import '../helpers/page-api.ts';

/** Real-time renders, and one real twelve-second arrival at the end. */
test.setTimeout(180_000);

const PHONE = { width: 390, height: 844 } as const;

let site: StaticSite;

test.beforeAll(async () => {
  site = await serveDirectory(join(REPO_ROOT, DIST_DIR));
});

test.afterAll(async () => {
  await site.close();
});

/** A phone, as a phone: touch input and mobile hit-testing, not a narrow window. */
async function onPhone(browser: Browser, run: unknown): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    viewport: { ...PHONE },
    isMobile: true,
    hasTouch: true,
    locale: 'cs-CZ',
  });
  const page = await context.newPage();
  await openGame(page, site.url, { run: run as never, clock: false });
  return { page, close: () => context.close() };
}

const scrollsSideways = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

/** Longitudes wrap; this is the shortest way between two of them, in degrees. */
const apart = (a: number, b: number): number => Math.abs((((a - b) % 360) + 540) % 360 - 180);

/**
 * Wait until the camera has finished easing onto `code`.
 *
 * Selecting a country in the atlas sets a target and the globe eases toward
 * it over a second or so. Sampling the canvas before that settles measures a
 * frame in the middle of the move, and the highlight is genuinely off-centre
 * in it — so the wait is part of the claim rather than a sleep.
 */
async function settledOn(page: Page, code: string): Promise<void> {
  const country = byCode[code]!;
  await expect
    .poll(async () => {
      const globe = (await status(page)).globe;
      return Math.max(apart(globe.longitude, country.lon), Math.abs(globe.latitude - country.lat));
    }, { timeout: 15_000 })
    .toBeLessThan(0.5);
}

test('renders the milestone on a real clock, with a globe that is actually drawn', async ({ page }) => {
  await openGame(page, site.url, { run: beforeMilestone(), clock: false });

  // No `runFor` anywhere in this file: the question clock has to start on the
  // browser's own frames, which is a different claim from "it starts when a
  // test ticks it".
  await page.waitForFunction(() => window.WorldGeography!.getStatus().clock?.running === true);

  const before = await state(page);
  const answer = await answerWith(page, true);
  expect(answer.scoreLifeDelta).toBe(Core.MILESTONE_LIVES);
  expect(answer.flagLifeDelta).toBe(0);
  expect(answer.basePoints).toBe(Core.BASE_POINTS);
  await expect(page.locator('.life-feedback')).toContainText(t('life.milestoneNextCountry'));
  expect((await state(page))!.lives[0]).toBe(before!.lives[0]! + Core.MILESTONE_LIVES);

  // The globe is drawn, and drawn as a globe: the highlight of the country in
  // play is on the canvas and sits in the middle of it, which is where the
  // camera is pointed. v7's floor is kept as a sanity bound underneath.
  const globe = await globeDrawn(page);
  expect(globe.covered * globe.width * globe.height).toBeGreaterThan(100_000);
  expect(globe.target, 'the country in play is not highlighted').toBeGreaterThan(20);
  expect(globe.targetCentre!.x).toBeGreaterThan(0.35);
  expect(globe.targetCentre!.x).toBeLessThan(0.65);
  expect(globe.targetCentre!.y).toBeGreaterThan(0.35);
  expect(globe.targetCentre!.y).toBeLessThan(0.65);
  console.log(
    `globe: ${(globe.covered * 100).toFixed(1)}% covered, `
      + `${globe.target.toLocaleString('en-US')} highlight px at `
      + `${globe.targetCentre!.x.toFixed(3)}, ${globe.targetCentre!.y.toFixed(3)}`,
  );
});

test('draws a centred disc at rest, with the corners left clear', async ({ page }) => {
  // The home screen, where the globe sits at zoom 1 and is smaller than its
  // canvas. This is the only state in which the disc's *extent* is visible at
  // all, and it is what a mis-sized, off-centre or filled canvas breaks.
  await openGame(page, site.url, { clock: false });
  const globe = await globeDrawn(page);

  expect((await status(page)).globe.zoom).toBe(1);
  expect(globe.covered, 'the globe fills its canvas').toBeLessThan(0.85);
  expect(globe.covered, 'the globe barely covers its canvas').toBeGreaterThan(0.35);
  // `draw` centres on `(w / 2, h * .51)`, so the painted mass averages out
  // there — a projection drawn from the wrong origin moves this and nothing
  // else a test can see.
  expect(Math.abs(globe.centre!.x - 0.5)).toBeLessThan(0.02);
  expect(Math.abs(globe.centre!.y - 0.51)).toBeLessThan(0.02);
  // Outside the atmospheric rim the canvas was cleared and never painted again.
  expect(globe.corners).toEqual([0, 0, 0, 0]);
  console.log(`globe at rest: ${(globe.covered * 100).toFixed(1)}% covered, centre ${globe.centre!.x.toFixed(3)}, ${globe.centre!.y.toFixed(3)}`);
});

test('pays the flag bonus on a real clock, in points and in one attempt', async ({ page }) => {
  await openGame(page, site.url, { run: onFlagBonus(), clock: false });
  await page.waitForFunction(() => window.WorldGeography!.getStatus().clock?.running === true);

  await expect(page.locator('.bonus-reward')).toHaveText(t('bonus.reward'));
  const before = await state(page);
  const answer = await answerWith(page, true);

  const after = await state(page);
  expect(answer.points).toBeGreaterThan(0);
  expect(after!.scores[0]! - before!.scores[0]!).toBe(answer.points);
  expect(after!.lives[0]! - before!.lives[0]!).toBe(1);
});

test('draws the globe over the country the run flew to', async ({ page }) => {
  // The one real arrival in this file. It is what makes the centroid mean
  // something: the globe is pointed at a country this test can name, so
  // "painted, and painted in the right place" is one assertion rather than
  // two unrelated ones.
  await openGame(page, site.url, { run: startOfCountry({ revealed: false }), clock: false });

  await expect(page.locator('#flight-title')).toBeVisible();
  await page.waitForFunction(
    () => window.WorldGeography!.getStatus().phase === 'question',
    null,
    { timeout: 60_000 },
  );

  const destination = byCode[(await question(page)).country]!;
  const flown = await status(page);

  // The globe finished where it was sent. Longitude wraps, so it is compared
  // the short way round rather than as a number.
  expect(apart(flown.globe.longitude, destination.lon), `longitude for ${destination.code}`).toBeLessThan(2);
  expect(Math.abs(flown.globe.latitude - destination.lat), `latitude for ${destination.code}`).toBeLessThan(2);
  expect(flown.globe.zoom).toBeGreaterThan(1);

  // And the picture agrees with the numbers. The marker `draw` puts on the
  // target is projected through `point(lon, lat)` — the same transform the
  // land is drawn with — so finding it in the middle of the frame says the
  // projection and the camera agree about where that country is.
  //
  // The floor is twenty rather than a proportion of the frame because this
  // seed's second country is Cape Verde, whose landmass is nine specks: what
  // is being counted here is essentially the marker alone. The test below,
  // which picks its own country, is the one that sees a landmass.
  const globe = await globeDrawn(page);
  expect(globe.target, `${destination.code} is not highlighted`).toBeGreaterThan(20);
  expect(globe.targetCentre!.x, `highlight x for ${destination.code}`).toBeGreaterThan(0.35);
  expect(globe.targetCentre!.x, `highlight x for ${destination.code}`).toBeLessThan(0.65);
  expect(globe.targetCentre!.y, `highlight y for ${destination.code}`).toBeGreaterThan(0.35);
  expect(globe.targetCentre!.y, `highlight y for ${destination.code}`).toBeLessThan(0.65);
  console.log(
    `flew to ${destination.code}; ${globe.target.toLocaleString('en-US')} highlight px at `
      + `${globe.targetCentre!.x.toFixed(3)}, ${globe.targetCentre!.y.toFixed(3)}`,
  );
});

test('highlights the selected country\'s own landmass, not just its marker', async ({ page }) => {
  // The atlas is where a country can be *chosen*, so it is the only place a
  // test can insist on one big enough for its fill to dominate the marker.
  // Without that the highlight count is sixty pixels whatever happens, and
  // "the country in play is drawn" degrades into "the marker is drawn".
  await openGame(page, site.url, { clock: false });
  await page.locator('#nav-atlas').click();
  await expect(page.locator('#atlas-list .atlas-item').first()).toBeVisible();

  const drawn: Record<string, number> = {};
  for (const code of ['BR', 'RU', 'CZ'] as const) {
    await page.locator(`[data-country="${code}"]`).click();
    await expect(page.locator(`[data-country="${code}"]`)).toHaveAttribute('aria-pressed', 'true');
    await settledOn(page, code);
    const globe = await globeDrawn(page);
    drawn[code] = globe.target;

    // Centred, because selecting a country points the globe at it.
    expect(globe.targetCentre, `${code} is not highlighted at all`).not.toBeNull();
    expect(Math.abs(globe.targetCentre!.x - 0.5), `highlight x for ${code}`).toBeLessThan(0.15);
    expect(Math.abs(globe.targetCentre!.y - 0.51), `highlight y for ${code}`).toBeLessThan(0.15);
  }

  // Thousands of pixels, not the sixty a marker alone would give: the fill is
  // the country's own polygons, projected. And it scales with the country —
  // Russia covers more of the globe than Brazil, which covers far more than
  // Czechia, and a highlight that ignored the geometry would not.
  expect(drawn['BR']!).toBeGreaterThan(3000);
  expect(drawn['RU']!).toBeGreaterThan(drawn['BR']!);
  expect(drawn['BR']!).toBeGreaterThan(drawn['CZ']! * 20);
  console.log(`highlight px — RU ${String(drawn['RU'])}, BR ${String(drawn['BR'])}, CZ ${String(drawn['CZ'])}`);
});

test.describe('on a 390 px phone', () => {
  test('shows the mobile HUD and never scrolls sideways', async ({ browser }) => {
    const { page, close } = await onPhone(browser, beforeMilestone());
    try {
      await page.waitForFunction(() => window.WorldGeography!.getStatus().clock?.running === true);

      await expect(page.locator('#mobile-hud')).toBeVisible();
      // Time left, points on offer and attempts remaining: the three readouts
      // the desktop panel has room for beside the globe and a phone does not.
      const hud = page.locator('#mobile-hud');
      await expect(hud).toContainText(t('hud.left'));
      await expect(hud).toContainText(t('hud.points'));
      await expect(hud).toContainText(t('hud.lives'));
      await expect(hud.locator('[data-time-readout]')).not.toBeEmpty();
      await expect(hud.locator('.mobile-lives strong')).toHaveText(String((await state(page))!.lives[0]));
      expect(await scrollsSideways(page)).toBe(false);

      // The sound dialog stops the countdown rather than letting it run behind
      // a modal, and leaves it stopped until the dialog is closed.
      await page.locator('#sound-options').click();
      await expect(page.locator('#dialog')).toBeVisible();
      await page.waitForFunction(() => window.WorldGeography!.getStatus().phase === 'paused');
      await page.locator('#dialog-close').click();
      expect((await status(page)).phase).toBe('paused');
      expect(await scrollsSideways(page)).toBe(false);
    } finally {
      await close();
    }
  });

  test('lays the flag bonus out without overflowing', async ({ browser }) => {
    const { page, close } = await onPhone(browser, onFlagBonus());
    try {
      await page.waitForFunction(() => window.WorldGeography!.getStatus().clock?.running === true);

      await expect(page.locator('.bonus-flag')).toBeVisible();
      await expect(page.locator('.bonus-reward')).toHaveText(t('bonus.reward'));
      expect(await scrollsSideways(page)).toBe(false);

      // The flag image is the question here, so it has to have a box: a broken
      // inline data URI renders as a zero-width element and nothing else fails.
      const box = (await page.locator('.bonus-flag').boundingBox())!;
      expect(box.width).toBeGreaterThan(40);
      expect(box.height).toBeGreaterThan(20);
      expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
    } finally {
      await close();
    }
  });
});
