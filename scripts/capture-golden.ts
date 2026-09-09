/**
 * Capture the four fidelity fixtures from the original v7 JavaScript.
 *
 * From U4 onward the ported engine, globe and synthesizer are measured against
 * these files and nothing else, so everything here reads only
 * `tests/fixtures/baseline/` — the untouched original — and never the ported
 * sources. Two fixtures come from the engine in Node; two need a real browser,
 * because `OfflineAudioContext` does not exist in Node and because a saved
 * `wg.run.v7` payload only exists once the shipped page has written one.
 *
 * Usage: node scripts/capture-golden.ts [all|questions|runs|audio|saves|verify-audio] [--out <dir>]
 *
 * Capture is slow on purpose (the save capture waits out real 12-second globe
 * flights); verification in `tests/unit/golden.test.ts` is not.
 */
import { createServer, type Server } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import { CHROMIUM_LAUNCH } from '../playwright.config.ts';
import { BASELINE_ROOT, loadCore, loadCountries, type GameState } from '../tests/helpers/load-baseline.ts';
import {
  captureQuestions,
  captureRuns,
  FIXTURES_DIR,
  type QuestionsGolden,
  type RunsGolden,
} from '../tests/helpers/golden.ts';
import {
  AUDIO_TOLERANCE,
  BAND_EDGES,
  compareAudioGolden,
  FFT_SIZE,
  FLOOR_DB,
  FRAMES,
  SAMPLE_RATE,
  WINDOWS_PER_FRAME,
  type AudioGolden,
  type ThemeDigest,
} from '../tests/helpers/audio-digest.ts';

/* ------------------------------------------------------------------ *
 * Fixture layout
 * ------------------------------------------------------------------ */

/** One entry per line: 14,040 objects on a single line is an undiffable fixture. */
function writeEntriesPerLine(
  file: string,
  header: Record<string, unknown>,
  key: string,
  entries: readonly unknown[],
): void {
  const head = Object.entries(header).map(
    ([name, value]) => `${JSON.stringify(name)}: ${JSON.stringify(value)}`,
  );
  const body = entries.map((entry) => JSON.stringify(entry)).join(',\n');
  writeFileSync(file, `{\n${head.join(',\n')},\n${JSON.stringify(key)}: [\n${body}\n]\n}\n`, 'utf8');
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function report(file: string): void {
  const bytes = readFileSync(file).byteLength;
  console.log(`  ${file} — ${bytes.toLocaleString('en-US')} bytes`);
}

/* ------------------------------------------------------------------ *
 * Node fixtures
 * ------------------------------------------------------------------ */

function captureQuestionsFixture(outDir: string): void {
  const golden: QuestionsGolden = captureQuestions(loadCore(), loadCountries());
  const { entries, ...header } = golden;
  const file = join(outDir, 'questions-golden.json');
  writeEntriesPerLine(file, header, 'entries', entries);
  console.log(`questions-golden.json — ${entries.length.toLocaleString('en-US')} entries`);
  report(file);
}

function captureRunsFixture(outDir: string): void {
  const golden: RunsGolden = captureRuns(loadCore(), loadCountries());
  const file = join(outDir, 'runs-golden.json');
  const { runs, ...header } = golden;
  writeEntriesPerLine(file, header, 'runs', runs);
  const steps = runs.reduce((sum, run) => sum + run.steps.length, 0);
  console.log(
    `runs-golden.json — ${runs.length} configurations, ${steps.toLocaleString('en-US')} steps`,
  );
  report(file);
}

/* ------------------------------------------------------------------ *
 * Browser harness
 * ------------------------------------------------------------------ */

/**
 * The shipped page is served over http rather than opened from `file://`:
 * a file origin has no reliable localStorage in Chromium, and `app.js`
 * swallows the failure, which would leave every save capture empty.
 */
async function serveBaseline(): Promise<{ origin: string; close: () => void }> {
  const html = readFileSync(join(BASELINE_ROOT, 'v7-index.html'));
  const server: Server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}/`, close: () => server.close() };
}

/* ------------------------------------------------------------------ *
 * audio-golden.json
 * ------------------------------------------------------------------ */

async function renderThemes(page: Page): Promise<ThemeDigest[]> {
  return page.evaluate(
    async (options: {
      sampleRate: number;
      frames: number;
      fftSize: number;
      windowsPerFrame: number;
      bandEdges: number[];
      floorAmplitude: number;
    }): Promise<ThemeDigest[]> => {
      interface Score {
        name: string;
        lead: number[];
      }
      interface AudioInstance {
        scene: string;
        scoreIndex: number;
        unlocked: boolean;
        noteCount: number;
        master: GainNode;
        musicFilter: BiquadFilterNode;
        connectGraph(context: BaseAudioContext): void;
        stepDuration(): number;
        playStep(step: number, time: number): void;
      }
      type AudioConstructor = {
        new (settings?: { volume?: number }): AudioInstance;
        QUESTION_SCORES: Score[];
      };
      const GeoAudio = (window as unknown as { GeoAudio: AudioConstructor }).GeoAudio;

      const fft = (re: Float64Array, im: Float64Array): void => {
        const n = re.length;
        for (let i = 1, j = 0; i < n; i += 1) {
          let bit = n >> 1;
          for (; j & bit; bit >>= 1) j ^= bit;
          j ^= bit;
          if (i < j) {
            const tr = re[i]!;
            re[i] = re[j]!;
            re[j] = tr;
            const ti = im[i]!;
            im[i] = im[j]!;
            im[j] = ti;
          }
        }
        for (let len = 2; len <= n; len <<= 1) {
          const step = -2 * Math.PI / len;
          const half = len >> 1;
          for (let i = 0; i < n; i += len) {
            for (let k = 0; k < half; k += 1) {
              const wr = Math.cos(step * k);
              const wi = Math.sin(step * k);
              const ur = re[i + k]!;
              const ui = im[i + k]!;
              const xr = re[i + k + half]!;
              const xi = im[i + k + half]!;
              const vr = xr * wr - xi * wi;
              const vi = xr * wi + xi * wr;
              re[i + k] = ur + vr;
              im[i + k] = ui + vi;
              re[i + k + half] = ur - vr;
              im[i + k + half] = ui - vi;
            }
          }
        }
      };

      const { sampleRate, frames, fftSize, windowsPerFrame, bandEdges, floorAmplitude } = options;
      const hann = new Float64Array(fftSize);
      for (let i = 0; i < fftSize; i += 1) {
        hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / fftSize);
      }
      const round = (value: number, places: number): number => {
        const factor = Math.pow(10, places);
        return Math.round(value * factor) / factor;
      };

      const digests: ThemeDigest[] = [];
      for (let index = 0; index < GeoAudio.QUESTION_SCORES.length; index += 1) {
        const score = GeoAudio.QUESTION_SCORES[index]!;
        const shape = new GeoAudio({ volume: 0.42 });
        shape.scene = 'question';
        shape.scoreIndex = index;
        const beat = shape.stepDuration();
        const duration = 0.05 + score.lead.length * beat + 0.6;
        const context = new OfflineAudioContext(1, Math.ceil(duration * sampleRate), sampleRate);

        const synth = new GeoAudio({ volume: 0.42 });
        synth.connectGraph(context);
        synth.unlocked = true;
        synth.scene = 'question';
        synth.scoreIndex = index;
        // `connectGraph` leaves the master silent until a gesture unlocks it, and
        // `applyTimbre` ramps the filter; both are set to their steady question
        // values so the render depends on nothing but the score.
        synth.master.gain.value = 0.42 * 0.72;
        synth.musicFilter.frequency.value = 2700;
        for (let step = 0; step < score.lead.length; step += 1) {
          synth.playStep(step, 0.05 + step * beat);
        }

        const pcm = (await context.startRendering()).getChannelData(0);
        let sumSquares = 0;
        let peak = 0;
        for (let i = 0; i < pcm.length; i += 1) {
          const v = pcm[i]!;
          sumSquares += v * v;
          const magnitude = Math.abs(v);
          if (magnitude > peak) peak = magnitude;
        }

        const spectrum: number[][] = [];
        const frameSize = Math.floor(pcm.length / frames);
        const re = new Float64Array(fftSize);
        const im = new Float64Array(fftSize);
        for (let f = 0; f < frames; f += 1) {
          const bandEnergy = new Float64Array(bandEdges.length - 1);
          for (let w = 0; w < windowsPerFrame; w += 1) {
            const start = f * frameSize + Math.floor((w * frameSize) / windowsPerFrame);
            re.fill(0);
            im.fill(0);
            for (let i = 0; i < fftSize; i += 1) {
              const at = start + i;
              re[i] = at < pcm.length ? pcm[at]! * hann[i]! : 0;
            }
            fft(re, im);
            for (let bin = 1; bin < fftSize / 2; bin += 1) {
              const hz = (bin * sampleRate) / fftSize;
              if (hz < bandEdges[0]! || hz >= bandEdges[bandEdges.length - 1]!) continue;
              let band = 0;
              while (band < bandEnergy.length && hz >= bandEdges[band + 1]!) band += 1;
              if (band >= bandEnergy.length) continue;
              const power = re[bin]! * re[bin]! + im[bin]! * im[bin]!;
              bandEnergy[band] = bandEnergy[band]! + power;
            }
          }
          spectrum.push(
            Array.from(bandEnergy, (energy) => {
              const amplitude = Math.sqrt(energy / (windowsPerFrame * fftSize * fftSize));
              // Two decimals of dBFS is a readable digest, not a stable one:
              // Chromium's renderer flips this last digit on a handful of the
              // 16,128 cells between runs. `AUDIO_TOLERANCE` is what comparisons
              // are held to; the rounding only keeps the fixture legible.
              return round(20 * Math.log10(Math.max(amplitude, floorAmplitude)), 2);
            }),
          );
        }

        digests.push({
          index,
          name: score.name,
          leadLength: score.lead.length,
          stepSeconds: beat,
          durationSeconds: round(duration, 9),
          notes: synth.noteCount,
          rms: round(Math.sqrt(sumSquares / pcm.length), 9),
          peak: round(peak, 9),
          spectrum,
        });
      }
      return digests;
    },
    {
      sampleRate: SAMPLE_RATE,
      frames: FRAMES,
      fftSize: FFT_SIZE,
      windowsPerFrame: WINDOWS_PER_FRAME,
      bandEdges: BAND_EDGES,
      floorAmplitude: Math.pow(10, FLOOR_DB / 20),
    },
  );
}

/**
 * Re-render and hold the committed fixture to its own declared tolerance.
 *
 * This is the executable form of the stability claim in `audio-digest.ts`: it
 * is what proves the digest survives a second run of the same Chromium build,
 * and it stays out of the unit suite because it needs a browser.
 */
async function verifyAudioFixture(browser: Browser, origin: string, outDir: string): Promise<void> {
  const file = join(outDir, 'audio-golden.json');
  const expected = JSON.parse(readFileSync(file, 'utf8')) as AudioGolden;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'load' });
  const themes = await renderThemes(page);
  await context.close();

  const problems = compareAudioGolden(expected, { ...expected, themes });
  if (problems.length > 0) {
    console.error(problems.slice(0, 20).join('\n'));
    throw new Error(`audio-golden.json did not reproduce: ${problems.length} deviations`);
  }
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
    `audio-golden.json reproduced on ${browser.version()} — worst band drift ${worstDb.toFixed(3)} dB `
      + `(tolerance ${AUDIO_TOLERANCE.bandDb}), worst amplitude drift ${worstAmplitude.toExponential(2)} `
      + `(tolerance ${AUDIO_TOLERANCE.amplitudeRelative})`,
  );
}

async function captureAudioFixture(browser: Browser, origin: string, outDir: string): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'load' });
  const themes = await renderThemes(page);
  await context.close();

  const golden: AudioGolden = {
    version: 7,
    browser: `chromium ${browser.version()}`,
    sampleRate: SAMPLE_RATE,
    frames: FRAMES,
    fftSize: FFT_SIZE,
    windowsPerFrame: WINDOWS_PER_FRAME,
    bandEdgesHz: BAND_EDGES.map((hz) => Math.round(hz * 1e6) / 1e6),
    floorDb: FLOOR_DB,
    tolerance: { ...AUDIO_TOLERANCE },
    units: 'dBFS per band, per equal-length frame of the rendered theme',
    themes,
  };
  const file = join(outDir, 'audio-golden.json');
  writeJson(file, golden);
  console.log(`audio-golden.json — ${themes.length} themes, ${browser.version()}`);
  report(file);
}

/* ------------------------------------------------------------------ *
 * tests/fixtures/baseline/runs/*.json
 * ------------------------------------------------------------------ */

const SAVE_KEY = 'wg.run.v7';
const WANTED = ['mid-country', 'mid-flight', 'post-milestone', 'pending-bonus'] as const;
type SaveName = (typeof WANTED)[number];

const readSave = (page: Page): Promise<GameState | null> =>
  page.evaluate((key: string) => {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as GameState);
  }, SAVE_KEY);

const isFlying = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.body.classList.contains('flying'));

/** The app starts the countdown only after the flag images decode and two frames pass. */
async function waitForRunningQuestion(page: Page): Promise<GameState> {
  await page.waitForSelector('.answer-list [data-answer]', { timeout: 60_000 });
  await page.waitForFunction(
    (key: string) => {
      const raw = localStorage.getItem(key);
      if (raw === null) return false;
      const game = JSON.parse(raw) as { index: number; clock: { index: number; paused: boolean } | null };
      return game.clock !== null && game.clock.index === game.index && !game.clock.paused;
    },
    SAVE_KEY,
    { timeout: 60_000 },
  );
  const save = await readSave(page);
  if (save === null) throw new Error('The page started a question without writing a save');
  return save;
}

/**
 * Play the shipped build until every wanted save state has been written.
 *
 * Answers are always correct, which reaches the first 10,000-point milestone on
 * the eleventh question or so and therefore the flag bonus a country later.
 */
async function captureSaveFixtures(browser: Browser, origin: string, outDir: string): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'load' });
  await page.click('#start');

  const captured = new Map<SaveName, GameState>();
  const keep = (name: SaveName, save: GameState): void => {
    if (!captured.has(name)) {
      captured.set(name, save);
      console.log(`  captured ${name} at question ${save.index + 1} (${save.questions[save.index]?.type})`);
    }
  };

  for (let guard = 0; guard < 60 && captured.size < WANTED.length; guard += 1) {
    const pending = await waitForRunningQuestion(page);
    const question = pending.questions[pending.index];
    if (question === undefined) throw new Error('A running question has no question object');
    if (question.type === 'capital') keep('mid-country', pending);
    if (question.type === 'flag') keep('pending-bonus', pending);

    await page.click(`.answer-list [data-answer="${question.correct}"]`);
    await page.waitForSelector('#next', { timeout: 30_000 });
    const answered = await readSave(page);
    if (answered === null) throw new Error('An answered question left no save');
    if ((answered.answers[answered.index]?.milestoneThresholds ?? []).length > 0) {
      keep('post-milestone', answered);
    }

    await page.click('#next');
    if (await isFlying(page)) {
      const flying = await readSave(page);
      if (flying !== null) keep('mid-flight', flying);
    }
  }

  await context.close();
  if (captured.size < WANTED.length) {
    throw new Error(
      `Only captured ${[...captured.keys()].join(', ')}; the shipped build never reached the rest`,
    );
  }

  const dir = join(outDir, 'baseline/runs');
  mkdirSync(dir, { recursive: true });
  for (const name of WANTED) {
    const file = join(dir, `${name}.json`);
    writeJson(file, captured.get(name));
    report(file);
  }
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

const USAGE =
  'Usage: node scripts/capture-golden.ts [all|questions|runs|audio|saves|verify-audio] [--out <dir>]';
type Job = 'all' | 'questions' | 'runs' | 'audio' | 'saves' | 'verify-audio';
const JOBS: readonly string[] = ['all', 'questions', 'runs', 'audio', 'saves', 'verify-audio'];

async function main(argv: readonly string[]): Promise<void> {
  let job: Job = 'all';
  let outDir = FIXTURES_DIR;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(USAGE);
      outDir = resolve(value);
      i += 1;
    } else if (arg !== undefined && JOBS.includes(arg)) {
      job = arg as Job;
    } else {
      throw new Error(USAGE);
    }
  }
  mkdirSync(outDir, { recursive: true });

  if (job === 'all' || job === 'questions') captureQuestionsFixture(outDir);
  if (job === 'all' || job === 'runs') captureRunsFixture(outDir);
  if (job === 'questions' || job === 'runs') return;

  const server = await serveBaseline();
  const browser = await chromium.launch({ ...CHROMIUM_LAUNCH });
  try {
    if (job === 'all' || job === 'audio') await captureAudioFixture(browser, server.origin, outDir);
    if (job === 'all' || job === 'saves') await captureSaveFixtures(browser, server.origin, outDir);
    if (job === 'verify-audio') await verifyAudioFixture(browser, server.origin, outDir);
  } finally {
    await browser.close();
    server.close();
  }
}

const invoked = process.argv[1];
if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
