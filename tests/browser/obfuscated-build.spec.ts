/**
 * U13 — the published build, opened the way a visitor opens it.
 *
 * `tests/unit/obfuscated-build.test.ts` reads the output as text and can prove
 * a great deal about it: no identifier survives, the flag payload stayed
 * outside the script, two builds match. What it cannot prove is that any of it
 * still runs. Control-flow flattening, RC4 string decoding, five chained
 * wrapper functions and `selfDefending` are each a way for a file to be
 * perfectly well-formed and completely dead, and only a browser notices.
 *
 * It also carries the measurements KTD4 asked for. After U13 the obfuscated
 * bundle is the only thing between the hot paths and the player, and there is
 * no unit-level oracle for "the globe still draws fast enough" — so the cost
 * is measured against the readable build and **recorded**. Deliberately not
 * gated: the ratio moves with the machine, and a shared runner is far too
 * noisy to carry a threshold. The assertions below are only that a measurement
 * happened at all, which is the failure this test can honestly catch.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildReadable } from '../../scripts/build.ts';
import { buildObfuscated } from '../../scripts/obfuscate.ts';
import '../helpers/page-api.ts';

/** Two builds, one of them a 2 s obfuscation pass, plus the arrival flight. */
test.setTimeout(300_000);

/** The frame accumulator `INSTRUMENT` installs; the page's own API is shared. */
declare global {
  interface Window {
    /** Every rAF callback's duration, in milliseconds, in order. */
    __frames?: number[];
  }
}

let dir: string;
const url: Record<string, string> = {};

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wg-dist-'));
  for (const [name, html] of [
    ['obfuscated', await buildObfuscated()],
    ['readable', await buildReadable()],
  ] as const) {
    const file = join(dir, `${name}.html`);
    writeFileSync(file, html, 'utf8');
    url[name] = pathToFileURL(file).href;
  }
});

test.afterAll(() => rmSync(dir, { recursive: true, force: true }));

test('opens from file:// and reaches a playable first question', async ({ page }) => {
  const requested: string[] = [];
  const failures: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  page.on('pageerror', (error) => failures.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });

  await page.goto(url['obfuscated']!);
  await expect(page.locator('#start')).toBeVisible();
  // The Czech arrives through the RC4 string table, five wrappers deep, so a
  // decoder that mangled non-ASCII would show up right here rather than as a
  // wrong letter somewhere in a dialog nobody opened.
  await expect(page.locator('#start')).toContainText('Zahájit expedici');

  await page.locator('#start').click();
  await page.waitForFunction(
    () => {
      const status = window.WorldGeography?.getStatus();
      return status?.phase === 'question' && status.clock?.running === true;
    },
    null,
    { timeout: 120_000 },
  );

  await expect(page.locator('#question-title')).not.toBeEmpty();
  await expect(page.locator('.answer-list button.answer')).toHaveCount(3);

  // R8 and R24, stated the only way a browser can state them.
  expect(requested).toEqual([url['obfuscated']]);
  expect(failures).toEqual([]);
});

test('still answers a lookup keyed by country code', async ({ page }) => {
  // The live half of `transformObjectKeys: false`. The atlas reaches the
  // country by its ISO code and then reads three more tables by the same key —
  // the flag, the capital and the currency — so a pass that had rewritten
  // object keys would render an empty card rather than throw.
  await page.goto(url['obfuscated']!);
  await page.locator('#nav-atlas').click();

  await expect(page.locator('#atlas-details h3')).toHaveText('Česko');
  await expect(page.locator('#atlas-details')).toContainText('Praha');
  await expect(page.locator('#atlas-details img')).toHaveCount(1);
  // The flag renders from the plain JSON block, which is the payload KTD6
  // keeps out of the bundle: a `data:` URI with real bytes behind it.
  await expect(page.locator('#atlas-details img')).toHaveAttribute('src', /^data:image\/png;base64,.{500,}/);
});

test('prints the licence notices as readable prose', async ({ page }) => {
  // R21. The notices are inlined plain and must survive as text a person can
  // read in the shipped file, not only in the readable one.
  await page.goto(url['obfuscated']!);
  await page.locator('#data-button').click();

  const details = page.locator('.license-details');
  await details.locator('summary').click();
  await expect(details.locator('pre')).toContainText('MIT License');
  await expect(details.locator('pre')).toContainText('OPEN DATABASE LICENSE (ODbL 1.0)');
  // And the path the reader is sent to is one the published site serves — no
  // ZIP package, which a Pages URL does not have.
  await expect(details.locator('pre')).toContainText('licenses/Apache-2.0.txt');
  await expect(details.locator('pre')).not.toContainText('ZIP');
});

/**
 * rAF callbacks to sample.
 *
 * Not the same as frames drawn. The globe throttles itself — it returns
 * immediately unless 30 ms have passed — so at 60 Hz roughly half of these are
 * a comparison and a re-register, costing nothing. Averaging over all of them
 * halves the number and flatters the published build, which is exactly the
 * mistake this constant is named to prevent: `measure` splits the two.
 */
const FRAMES = 600;
/** Above any throttled no-op, far below any real draw. */
const WORKING_FRAME_MS = 0.05;
/** Long enough for the scheduler to place a few bars of the question theme. */
const AUDIO_WINDOW_MS = 6_000;

/**
 * Wrap `requestAnimationFrame` before any page script runs.
 *
 * The globe's frame callback is `update` then `draw` and nothing else, so
 * timing the callback *is* timing the hot path — and it is the only way to
 * reach it: the bundle keeps its `Globe` instance inside its own closure, and
 * after this unit the class does not have a name to reach for anyway.
 */
const INSTRUMENT = `
  window.__frames = [];
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => raf((t) => {
    const before = performance.now();
    callback(t);
    const after = performance.now();
    if (window.__frames.length < ${FRAMES}) window.__frames.push(after - before);
  });
`;

interface Measurement {
  /** Milliseconds from navigation to a home screen a player can click. */
  bootMs: number;
  /** rAF callbacks sampled, and how many of them actually drew. */
  sampled: number;
  working: number;
  /** Mean and 95th percentile of the callbacks that drew. */
  perFrameMs: number;
  p95Ms: number;
  notes: number;
}

/**
 * One measurement, in a context of its own.
 *
 * Both flavors could be measured in two tabs of one context, and the numbers
 * would be nonsense: Chromium marks every page but the foreground one
 * `document.hidden`, and the globe's frame callback deliberately does nothing
 * while hidden — so the second tab never finishes its arrival flight at all.
 * A fresh context per measurement also means the two runs are compared under
 * the same conditions rather than one warm and one cold, which for a number
 * whose whole purpose is the comparison is not a detail.
 */
async function measureIn(browser: Browser, at: string): Promise<Measurement> {
  const context = await browser.newContext({ locale: 'cs-CZ' });
  try {
    return await measure(await context.newPage(), at);
  } finally {
    await context.close();
  }
}

async function measure(page: Page, at: string): Promise<Measurement> {
  await page.addInitScript(INSTRUMENT);

  // Boot is its own cost and its own question. This is where the whole bundle
  // is evaluated and the RC4 string table is decoded, so it is the one number
  // the encoding choice could plausibly ruin — and it is invisible in a
  // per-frame average, which only starts once the game is already running.
  const startedAt = Date.now();
  await page.goto(at);
  await page.locator('#start').waitFor({ state: 'visible' });
  const bootMs = Date.now() - startedAt;

  await page.locator('#start').click();
  await page.waitForFunction(
    () => {
      const status = window.WorldGeography?.getStatus();
      return status?.phase === 'question' && status.clock?.running === true;
    },
    null,
    { timeout: 120_000 },
  );

  // Start counting once the question is up: the arrival flight is a different
  // workload from the idle spin, and it is the idle spin the player sits in.
  await page.evaluate(() => { window.__frames = []; });
  const before = await page.evaluate(() => window.WorldGeography!.getStatus().audio.notes);
  await page.waitForFunction((n) => (window.__frames?.length ?? 0) >= n, FRAMES, { timeout: 120_000 });
  await page.waitForTimeout(AUDIO_WINDOW_MS);
  const after = await page.evaluate(() => window.WorldGeography!.getStatus().audio.notes);
  const sampled = await page.evaluate(() => window.__frames!);

  const working = sampled.filter((ms) => ms >= WORKING_FRAME_MS).sort((a, b) => a - b);
  const total = working.reduce((sum, ms) => sum + ms, 0);

  return {
    bootMs,
    sampled: sampled.length,
    working: working.length,
    perFrameMs: total / working.length,
    p95Ms: working[Math.floor(working.length * 0.95)] ?? 0,
    notes: after - before,
  };
}

test('records the hot-path cost against the readable build', async ({ browser }, testInfo) => {
  const obfuscated = await measureIn(browser, url['obfuscated']!);
  const readable = await measureIn(browser, url['readable']!);

  const times = (m: Measurement): string =>
    `${m.perFrameMs.toFixed(3)} ms mean, ${m.p95Ms.toFixed(3)} ms p95`
    + ` (${m.working} of ${m.sampled} callbacks drew)`;
  const report = [
    `boot to a clickable home screen:`,
    `  readable   ${readable.bootMs} ms`,
    `  obfuscated ${obfuscated.bootMs} ms  (${(obfuscated.bootMs / readable.bootMs).toFixed(1)}x)`,
    // Per frame that drew, not per rAF callback: the globe's own 30 ms throttle
    // makes about half of them no-ops, and averaging those in halves the
    // number. The budget this spends against is that same 30 ms.
    `globe update+draw, per frame that drew:`,
    `  readable   ${times(readable)}`,
    `  obfuscated ${times(obfuscated)}  (${(obfuscated.perFrameMs / readable.perFrameMs).toFixed(1)}x mean)`,
    `audio notes scheduled in ${AUDIO_WINDOW_MS / 1000} s:`,
    `  readable   ${readable.notes}`,
    `  obfuscated ${obfuscated.notes}`,
  ].join('\n');
  console.log(`\n${report}\n`);
  await testInfo.attach('hot-path-cost.txt', { body: report, contentType: 'text/plain' });

  // Not a threshold. The only claim is that both numbers were measured rather
  // than silently recorded as zero, which is how a recording test rots: the
  // instrumentation stops firing, every run reports 0.000 ms, and the record
  // says the obfuscation is free.
  for (const [name, m] of [['readable', readable], ['obfuscated', obfuscated]] as const) {
    expect({ name, sampled: m.sampled }).toEqual({ name, sampled: FRAMES });
    // A throttle that stopped throttling, or an instrument that stopped
    // firing, would both show up as every callback landing on one side.
    expect(m.working, `${name}: no callback drew`).toBeGreaterThan(FRAMES / 10);
    expect(m.working, `${name}: nothing was throttled`).toBeLessThan(FRAMES);
    expect(m.perFrameMs, `${name}: frame cost`).toBeGreaterThan(0);
    expect(m.bootMs, `${name}: boot`).toBeGreaterThan(0);
    expect(m.notes, `${name}: audio`).toBeGreaterThan(0);
  }
});
