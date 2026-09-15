/**
 * U11 — the language switch, in a browser that actually lays the header out.
 *
 * The Node suite proves the catalog resolves and the shell re-renders. What it
 * cannot see is the half of this unit that is geometry: English labels are
 * longer than Czech ones in almost every slot, the header is a flex row with
 * three controls in it now, and the failure mode is a wrapped bar or a clipped
 * word at one width on one screen. So the switch is driven for real here and
 * the boxes are measured.
 *
 * The suite's own locale is pinned to `cs-CZ` in `playwright.config.ts`, which
 * is what makes every *other* spec deterministic; this file is where the other
 * language is reached, by clicking the control a player would click.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeReadable } from '../../scripts/build.ts';

test.setTimeout(120_000);

let pageUrl: string;
let outDir: string;

test.beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'wg-i18n-'));
  const file = join(outDir, 'index.html');
  await writeReadable(undefined, file);
  pageUrl = pathToFileURL(file).href;
});

test.afterAll(() => rmSync(outDir, { recursive: true, force: true }));

/** The six widths the stylesheet has breakpoints for. */
const WIDTHS = [1450, 1150, 840, 700, 480, 390] as const;

const switchLanguage = async (page: Page): Promise<void> => {
  await page.locator('#language').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
};

test('opens in the browser language, and says so on the document', async ({ page }) => {
  await page.goto(pageUrl);

  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  await expect(page.locator('#nav-play')).toHaveText('Expedice');
  // The control offers the language it is *not* showing, like the sound button
  // beside it names the action rather than the state.
  await expect(page.locator('#language')).toHaveText(/EN/);
});

test('switches the whole shell, chrome included, and announces it', async ({ page }) => {
  await page.goto(pageUrl);

  await switchLanguage(page);

  // The re-rendered screen…
  await expect(page.locator('#side-panel')).toContainText('Begin the expedition');
  // …the static chrome, which no render function owns…
  await expect(page.locator('#nav-play')).toHaveText('Expedition');
  await expect(page.locator('footer button#data-button')).toContainText('Data & sources');
  // …and the announcement, in the language just switched to.
  await expect(page.locator('#toast')).toHaveText('Language: English');
  await expect(page.locator('#language')).toBeFocused();
});

test('keeps the choice across a reload', async ({ page }) => {
  await page.goto(pageUrl);
  await switchLanguage(page);

  await page.reload();

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#nav-play')).toHaveText('Expedition');
});

test('locks the switcher while a run is on screen', async ({ page }) => {
  await page.goto(pageUrl);
  await page.locator('#start').click();

  await expect(page.locator('#language')).toBeDisabled();
  await expect(page.locator('#language')).toHaveAttribute('title', /rozehrané hry/);

  // Leaving the run gives it back, without the run being lost.
  await page.locator('#back-home').click();
  await expect(page.locator('#language')).toBeEnabled();
  await expect(page.locator('#resume')).toBeVisible();
});

test('renders the header without wrapping or overflow, in both languages', async ({ page }) => {
  await page.goto(pageUrl);

  for (const language of ['cs', 'en'] as const) {
    if (language === 'en') await switchLanguage(page);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const header = page.locator('header.header');
      // Overflow in either direction, rather than counting rows: the controls
      // are different heights and sit at different offsets by design, so their
      // `top` values disagree even when the bar is a single row. A wrap shows
      // up as the header growing past the height its own box allows.
      const box = await header.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        actionsBottom: Math.round(el.querySelector('.header-actions')!.getBoundingClientRect().bottom),
        headerBottom: Math.round(el.getBoundingClientRect().bottom),
      }));

      expect(box.scrollWidth, `${language} at ${width}: the header scrolls sideways`)
        .toBeLessThanOrEqual(box.clientWidth + 1);
      expect(box.scrollHeight, `${language} at ${width}: the header wrapped`)
        .toBeLessThanOrEqual(box.clientHeight + 1);
      expect(box.actionsBottom, `${language} at ${width}: the controls escape the header`)
        .toBeLessThanOrEqual(box.headerBottom + 1);
    }
  }
});

test('gives the switcher a hit area of at least 32 px at every width', async ({ page }) => {
  await page.goto(pageUrl);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const box = (await page.locator('#language').boundingBox())!;
    expect(box.width, `width ${width}`).toBeGreaterThanOrEqual(28);
    expect(box.height, `width ${width}`).toBeGreaterThanOrEqual(32);
  }
});

test('clips no text on any screen in English', async ({ page }) => {
  await page.goto(pageUrl);
  await switchLanguage(page);

  const SCREENS: readonly { name: string; open: (page: Page) => Promise<void> }[] = [
    { name: 'home', open: async () => {} },
    { name: 'atlas', open: async (p) => { await p.locator('#nav-atlas').click(); } },
    { name: 'help', open: async (p) => { await p.locator('#nav-help').click(); } },
    { name: 'sources', open: async (p) => { await p.locator('#data-button').click(); } },
  ];

  for (const screen of SCREENS) {
    await page.goto(pageUrl);
    await page.locator('#language').click();
    await screen.open(page);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('button, h1, h2, h3, .field-label, .eyebrow, .nav-button')]
          .filter((el) => el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1)
          .map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}: ${el.textContent?.slice(0, 40)}`));
      expect(clipped, `${screen.name} at ${width}`).toEqual([]);
    }
  }
});
