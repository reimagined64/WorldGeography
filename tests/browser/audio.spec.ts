/**
 * U5 — the ported synthesizer, held to the sound the original made.
 *
 * `tests/unit/audio.test.ts` proves which notes are scheduled; this proves what
 * comes out of the graph. It has to live here rather than in the unit suite
 * because `OfflineAudioContext` is a browser API and is `undefined` in Node, so
 * there is no way to render a theme at all without a real Chromium.
 *
 * `audio-golden.json` was captured from the *baseline* `audio.js` in Chromium.
 * The digest is deliberately not a hash of the PCM — Chromium's renderer is not
 * bit-reproducible even between two runs of one build — so the fixture carries
 * its own tolerance and `compareAudioGolden` is what a match means. A theme
 * that lands outside that tolerance is a defect in the port, not a stale
 * fixture: the tolerance sits an order of magnitude above the measured
 * run-to-run noise and an order of magnitude below any audible change.
 *
 * The page under test is the real readable build, not a bespoke harness, so a
 * bundle that fails to load at all fails here too. The synthesizer itself is
 * injected rather than read off the page: U16 deleted the global shim, and the
 * built bundle keeps its one `GeoAudio` instance inside its own closure, so
 * `renderThemes` gets the class from a second bundle of the same source file
 * instead of from a global the product would otherwise have to keep exporting.
 *
 * U14 adds the other half, at the bottom: the sound dialog a player actually
 * uses. The digests above prove the twenty-one scores render correctly; they
 * say nothing about whether the control that auditions them reaches all
 * twenty-one, and a bag that refilled wrongly would leave a player cycling
 * five. That one runs against the published build, because the dialog is
 * chrome and chrome is what obfuscation rewrites.
 */
import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, writeReadable } from '../../scripts/build.ts';
import { DIST_DIR } from '../../scripts/obfuscate.ts';
import { t } from '../../src/i18n/index.ts';
import { openGame, status } from '../helpers/play.ts';
import { serveDirectory, type StaticSite } from '../helpers/static-server.ts';
import { renderThemes } from '../../scripts/capture-golden.ts';
import { FIXTURES_DIR } from '../helpers/golden.ts';
import {
  AUDIO_TOLERANCE,
  compareAudioGolden,
  type AudioGolden,
  type ThemeDigest,
} from '../helpers/audio-digest.ts';

/** Twenty-one themes of roughly 36 s each, rendered offline, plus a build. */
test.setTimeout(600_000);

const expected = JSON.parse(
  readFileSync(join(FIXTURES_DIR, 'audio-golden.json'), 'utf8'),
) as AudioGolden;

let out: string;
let themes: ThemeDigest[];

/** `src/audio/audio.ts`, bundled on its own and published under v7's name. */
async function audioGlobalScript(): Promise<string> {
  const result = await build({
    absWorkingDir: REPO_ROOT,
    stdin: {
      contents: "import { GeoAudio } from './src/audio/audio.ts';\n"
        + "import { t } from './src/i18n/index.ts';\n"
        + "(window as unknown as Record<string, unknown>)['GeoAudio'] = GeoAudio;\n"
        // U11: a score carries the *key* of its name, so the digest needs the
        // catalog to say what the fixture recorded. The default locale is
        // Czech, which is what `audio-golden.json` was captured in.
        + "(window as unknown as Record<string, unknown>)['wgT'] = t;\n",
      resolveDir: REPO_ROOT,
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    charset: 'utf8',
    write: false,
    logLevel: 'silent',
  });
  const [output] = result.outputFiles;
  if (output === undefined) throw new Error('esbuild produced no synthesizer bundle');
  return output.text;
}

test.beforeAll(async ({ browser }) => {
  // A file-scope `test.setTimeout` raises the budget for the tests, not for
  // this hook, and the whole render happens here.
  test.setTimeout(600_000);
  out = mkdtempSync(join(tmpdir(), 'wg-audio-'));
  const file = join(out, 'index.html');
  await writeReadable(undefined, file);

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.addScriptTag({ content: await audioGlobalScript() });
  themes = await renderThemes(page);
  await context.close();
});

test.afterAll(() => {
  rmSync(out, { recursive: true, force: true });
});

test('reproduces every theme of audio-golden.json within its tolerance', () => {
  const problems = compareAudioGolden(expected, { ...expected, themes });

  // The first twenty lines name the theme, frame and band, which is what turns
  // a failure into a bug report rather than a re-capture.
  expect(problems.slice(0, 20).join('\n')).toBe('');
  expect(problems).toHaveLength(0);
});

test('renders all twenty-one themes, named and sized as the baseline scored them', () => {
  expect(themes).toHaveLength(21);
  expect(themes.map((theme) => theme.name)).toEqual(expected.themes.map((theme) => theme.name));
  expect(themes.map((theme) => theme.leadLength)).toEqual([64, ...Array<number>(20).fill(128)]);
  // Note counts are integers the fixture pins exactly; a dropped voice moves
  // them even where the spectrum has drifted back inside tolerance.
  expect(themes.map((theme) => theme.notes)).toEqual(expected.themes.map((theme) => theme.notes));
});

test('stays well inside the tolerance rather than merely under it', () => {
  let worstDb = 0;
  let worstAmplitude = 0;
  for (const [index, want] of expected.themes.entries()) {
    const got = themes[index] as ThemeDigest;
    for (const key of ['rms', 'peak'] as const) {
      worstAmplitude = Math.max(worstAmplitude, Math.abs(got[key] - want[key]) / Math.abs(want[key]));
    }
    for (const [frame, row] of want.spectrum.entries()) {
      for (const [band, db] of row.entries()) {
        worstDb = Math.max(worstDb, Math.abs((got.spectrum[frame]?.[band] as number) - db));
      }
    }
  }
  console.log(
    `port vs audio-golden.json — worst band drift ${worstDb.toFixed(3)} dB `
      + `(tolerance ${AUDIO_TOLERANCE.bandDb}), worst amplitude drift ${worstAmplitude.toExponential(2)} `
      + `(tolerance ${AUDIO_TOLERANCE.amplitudeRelative})`,
  );

  // Half the allowance is the alarm: a port drifting that far is diverging,
  // even while it still passes. The fixture's own re-capture moved 0.01 dB.
  expect(worstDb).toBeLessThan(AUDIO_TOLERANCE.bandDb / 2);
  expect(worstAmplitude).toBeLessThan(AUDIO_TOLERANCE.amplitudeRelative / 2);
});

/**
 * U14 — the control that auditions the scores, on the build that ships.
 *
 * `browser.test.py` clicked this twice and checked the two themes differed.
 * Twice is enough to catch a control that does nothing and not enough to catch
 * a bag that refills wrongly, which is the failure this dialog can actually
 * have: `prepareTheme` shuffles all twenty-one indices into a bag, shifts one
 * per question, and refills when the bag empties — so a bug in the refill
 * shows up as a player hearing the same handful for ever, and only on the
 * twenty-second click.
 */
test.describe('the sound dialog', () => {
  let site: StaticSite;

  test.beforeAll(async () => {
    site = await serveDirectory(join(REPO_ROOT, DIST_DIR));
  });

  test.afterAll(async () => {
    await site.close();
  });

  test('auditions all twenty-one themes, each from its own starting bar', async ({ page }) => {
    await openGame(page, site.url, { audio: { enabled: true }, clock: false });

    await page.locator('#sound-options').click();
    await expect(page.locator('#dialog-title')).toHaveText(t('audio.title'));

    const heard: { index: number; name: string; startStep: number }[] = [];
    await page.locator('#audio-question-preview').click();

    for (let i = 0; i < 21; i += 1) {
      if (i > 0) await page.locator('#audio-next-theme').click();
      const melody = (await status(page)).audio.melody;
      heard.push({ index: melody.index, name: melody.name, startStep: melody.startStep });

      // The label names what is playing, so a reader can tell which of the
      // twenty-one they are hearing rather than only that it changed.
      await expect(page.locator('#audio-theme-label')).toContainText(melody.name);
      expect(melody.count).toBe(21);
    }

    // All twenty-one, each exactly once: that is what a bag is for, and it is
    // the claim two clicks cannot make.
    expect(new Set(heard.map((m) => m.index)).size).toBe(21);
    expect(new Set(heard.map((m) => m.name)).size).toBe(21);
    // And no two consecutive auditions start at the same bar, which is the
    // other half of `prepareTheme` — the one that stops a repeated theme from
    // sounding like a repeated recording.
    for (const [i, melody] of heard.slice(1).entries()) {
      expect(melody.startStep, `audition ${String(i + 2)} repeats the previous offset`)
        .not.toBe(heard[i]!.startStep);
    }

    // The answer cues are the same dialog's other job, and they move the
    // synthesizer to the scene that plays them.
    await page.locator('#audio-preview').click();
    await expect.poll(async () => (await status(page)).audio.scene).toBe('feedback');
  });
});
