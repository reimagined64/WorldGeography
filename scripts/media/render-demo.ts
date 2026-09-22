/**
 * Re-render `docs/media/answering-music.mp3` from the synthesizer that ships.
 *
 * **Requires `ffmpeg` on PATH.** It is the only thing here that is not Node:
 * the encode is `libmp3lame` at `-q:a 3`, which is what produced the file this
 * replaces.
 *
 * **This is not part of any test, gate or CI job, and no requirement consumes
 * its output.** Nothing in `src/`, `tests/`, `scripts/build.ts` or the
 * workflows reads the mp3; it is a demo artifact that lives in the docs so a
 * reader can hear the twenty-one question themes without building and playing
 * the game. There is deliberately no npm script for it — the scaffold suite
 * pins the exact command surface, and a demo renderer is not part of it. Run
 * it directly, on purpose, when the synthesis changes:
 *
 *     node scripts/media/render-demo.ts [--out <file>]
 *
 * ## Why this file exists at all
 *
 * The committed mp3 was rendered by v6's Python demo script driving v6's
 * `audio.js` through Playwright. Both were deleted in U14 — R1 forbids the
 * Python, and the plan's note on the deletion is correct that nothing needs the
 * renderer. What it left behind is a *stale* artifact: an mp3 in the docs of a
 * project whose synthesizer is now `src/audio/audio.ts`, claiming to be what
 * the project sounds like on the authority of code that is no longer here. This
 * script is the smallest thing that makes the claim true again, and nothing
 * more: it is the v6 arrangement, note for note, driven by the ported class.
 *
 * `docs/provenance/manifest-sha256.json` still records the v6 render's hash
 * under the path it had in the v7 tree, and must keep doing so. That file is a
 * frozen record of what v7 contained, not a statement about what is in `docs/`
 * now; re-rendering the demo does not falsify it and must not edit it.
 *
 * ## What this is *not* allowed to be
 *
 * It is not a second opinion about whether the port sounds right. That question
 * is already answered, and answered better: `tests/fixtures/audio-golden.json`
 * is a spectral digest of the *baseline* `audio.js` rendering each of the 21
 * scores, and `tests/browser/audio.spec.ts` holds the ported synthesizer to it
 * within a tolerance an order of magnitude below anything audible. An mp3 is a
 * lossy encode of a render that is not bit-reproducible even between two runs
 * of one Chromium, so it could never carry that claim. If the two ever
 * disagree, the spec is right and this file is a curiosity.
 *
 * ## Why it renders its own PCM instead of calling `renderThemes`
 *
 * `renderThemes` in `scripts/capture-golden.ts` is the other path from a
 * synthesizer to samples in a browser, and it is the right one for what it
 * does — but it returns digests rather than PCM, and it renders each theme into
 * its own `OfflineAudioContext` from step 0 with no cue after it, because that
 * is the isolation a per-theme fixture needs. The demo is the opposite shape:
 * one continuous context, twenty-one fixed-length slots, each theme entering at
 * a start step drawn by a seeded selector, each slot answered by one of the
 * three cues. Teaching `renderThemes` to also emit PCM would widen the function
 * two suites depend on for the benefit of an artifact nobody reads, and
 * `capture-golden.ts` says in its own header that it reads the frozen baseline
 * and never the ported sources — so it is the wrong home for anything that
 * bundles `src/audio/audio.ts`. This parallels it instead.
 *
 * What is genuinely shared is everything that can be: `CHROMIUM_LAUNCH` pins
 * the same browser settings every other browser job uses, `REPO_ROOT` comes
 * from the build, and the selection of themes and start bars is computed in
 * Node from the same `GeoAudio` and the same `rng` the game uses, so the only
 * thing the page is asked to do is the one thing Node cannot: run Web Audio.
 * The esbuild stdin bundle below is the technique `tests/browser/audio.spec.ts`
 * uses to publish `GeoAudio` onto `window`, written out again rather than
 * imported from it — importing would make this script part of that spec's
 * dependency graph, which is precisely the thing the header above promises it
 * is not.
 */
import { chromium, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROMIUM_LAUNCH } from '../../playwright.config.ts';
import { REPO_ROOT } from '../build.ts';
import { GeoAudio } from '../../src/audio/audio.ts';
import { rng } from '../../src/engine/core.ts';
import { t } from '../../src/i18n/index.ts';

/* ------------------------------------------------------------------ *
 * The arrangement
 * ------------------------------------------------------------------ */

/**
 * The v6 demo's layout, unchanged.
 *
 * Twenty-one 6.4 s slots, eighteen steps of the theme starting 0.08 s into
 * each, and the rest of the slot left for the answer cue to ring out. At the
 * scores' 108 BPM eighth-note grid a step is 0.2777 s, so eighteen of them is
 * 5.0 s of music and roughly 1.4 s of cue and silence. These are reproduced
 * rather than re-chosen: the point of the file is that it is the same demo,
 * made by the current code.
 */
const SLOT_SECONDS = 6.4;
const STEPS_PER_SLOT = 18;
const SLOT_LEAD_IN = 0.08;
const CUE_DELAY = 0.05;
const TAIL_SECONDS = 0.4;

/** Not imported from the golden digest's constants: this is the demo's own encode rate. */
const SAMPLE_RATE = 44_100;

/**
 * The seed that fixes which theme plays in which slot, and from which bar.
 *
 * `prepareTheme` shuffles a bag of all 21 indices and a per-theme bag of start
 * bars, so an unseeded demo would be a different record every time it was
 * rendered and no two copies of the docs would agree. A second `GeoAudio`
 * driven by `rng(seed)` does the drawing and the rendering instance is simply
 * told the answer, which is exactly how v6 did it.
 */
const SELECTOR_SEED = 600_606;

/** One per slot, cycling, so the demo also plays all three answer cues. */
const CUES: readonly string[] = ['correct', 'wrong', 'extraLife'];

/** Master and filter values the live graph settles on in the question scene. */
const DEMO_VOLUME = 0.42;
const UNLOCKED_MASTER_GAIN = DEMO_VOLUME * 0.72;
const QUESTION_FILTER_HZ = 2700;

/** Long enough to be inaudible, short enough not to eat the first note or last cue. */
const FADE_IN_SECONDS = 0.05;
const FADE_OUT_SECONDS = 0.25;

const DEFAULT_OUTPUT = 'docs/media/answering-music.mp3';
const LAME_QUALITY = '3';
const MP3_TITLE = 'World Geography — 21 question themes';

/* ------------------------------------------------------------------ *
 * Slot selection, in Node
 * ------------------------------------------------------------------ */

/** What the page is told about one slot; everything else it can derive. */
interface SlotPlan {
  slot: number;
  themeIndex: number;
  name: string;
  offsetStep: number;
  startSeconds: number;
  endSeconds: number;
  cue: string;
}

/**
 * Draw the twenty-one slots without touching Web Audio.
 *
 * `GeoAudio` is constructible in Node — the constructor sets fields and
 * `prepareTheme` guards every graph access on `context` — so the half of the
 * demo that is arithmetic happens here, where it can be printed, asserted on
 * and diffed. Only the synthesis crosses into the browser.
 */
function planSlots(): SlotPlan[] {
  const selector = new GeoAudio({ volume: DEMO_VOLUME, random: rng(SELECTOR_SEED) });
  // `stepDuration` reads the scene, and a demo slot is a question.
  selector.scene = 'question';

  const plan: SlotPlan[] = [];
  for (let k = 0; k < GeoAudio.QUESTION_SCORES.length; k += 1) {
    // The key only has to differ per question; `beginQuestion` ignores a repeat.
    selector.beginQuestion(`demo:${String(k)}`);
    const start = k * SLOT_SECONDS + SLOT_LEAD_IN;
    plan.push({
      slot: k + 1,
      themeIndex: selector.scoreIndex,
      name: t(selector.activeScore().nameKey),
      offsetStep: selector.questionStartStep,
      startSeconds: start,
      endSeconds: start + STEPS_PER_SLOT * selector.stepDuration(),
      // `CUES` is non-empty and the index is a remainder of its length.
      cue: CUES[k % CUES.length]!,
    });
  }
  return plan;
}

/* ------------------------------------------------------------------ *
 * The render, in Chromium
 * ------------------------------------------------------------------ */

/** What one slot sounded like, for the checks below; not written anywhere. */
interface SlotMeasurement extends SlotPlan {
  rms: number;
}

interface Render {
  /** Base64 of interleaved 16-bit little-endian mono PCM at `SAMPLE_RATE`. */
  data: string;
  duration: number;
  notes: number;
  peak: number;
  rms: number;
  clipped: number;
  slots: SlotMeasurement[];
}

/** `src/audio/audio.ts`, bundled on its own and published under v7's name. */
async function audioGlobalScript(): Promise<string> {
  const result = await build({
    absWorkingDir: REPO_ROOT,
    stdin: {
      contents: "import { GeoAudio } from './src/audio/audio.ts';\n"
        + "(window as unknown as Record<string, unknown>)['GeoAudio'] = GeoAudio;\n",
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

/**
 * Schedule every slot into one `OfflineAudioContext` and hand back the samples.
 *
 * The graph is put into the state a gesture and a settled question scene would
 * leave it in — `unlocked`, master at its steady value, music filter at its
 * question cutoff — rather than being driven there, so the render depends on
 * the scores and nothing about timing. `musicBus` is opened at the top of each
 * slot and released with the same 6 ms time constant `stopVoices` uses, which
 * is what stops one theme's tail from playing under the next one's first bar.
 */
async function renderDemo(page: Page, plan: readonly SlotPlan[]): Promise<Render> {
  return page.evaluate(
    async (options: {
      plan: SlotPlan[];
      sampleRate: number;
      slotSeconds: number;
      steps: number;
      tailSeconds: number;
      cueDelay: number;
      volume: number;
      masterGain: number;
      filterHz: number;
      fadeIn: number;
      fadeOut: number;
    }): Promise<Render> => {
      interface AudioInstance {
        scene: string;
        scoreIndex: number;
        unlocked: boolean;
        noteCount: number;
        master: GainNode;
        musicBus: GainNode;
        musicFilter: BiquadFilterNode;
        connectGraph(context: BaseAudioContext): void;
        stepDuration(): number;
        playStep(step: number, time: number): void;
        scheduleCue(kind: string, time: number): void;
      }
      type AudioConstructor = new (settings?: { volume?: number }) => AudioInstance;
      const GeoAudio = (window as unknown as { GeoAudio: AudioConstructor }).GeoAudio;

      const { plan: slots, sampleRate, slotSeconds, steps, tailSeconds, cueDelay } = options;
      const duration = slots.length * slotSeconds + tailSeconds;
      const context = new OfflineAudioContext(1, Math.ceil(duration * sampleRate), sampleRate);

      const synth = new GeoAudio({ volume: options.volume });
      synth.connectGraph(context);
      synth.unlocked = true;
      synth.scene = 'question';
      synth.master.gain.value = options.masterGain;
      synth.musicFilter.frequency.value = options.filterHz;

      for (const slot of slots) {
        synth.scoreIndex = slot.themeIndex;
        const beat = synth.stepDuration();
        synth.musicBus.gain.setValueAtTime(0.6, slot.startSeconds);
        for (let step = 0; step < steps; step += 1) {
          synth.playStep(slot.offsetStep + step, slot.startSeconds + step * beat);
        }
        synth.musicBus.gain.setTargetAtTime(0.00001, slot.endSeconds, 0.006);
        synth.scheduleCue(slot.cue, slot.endSeconds + cueDelay);
      }

      const pcm = (await context.startRendering()).getChannelData(0);

      // One pass: the top-and-tail fade, the quantisation to 16-bit, and the
      // three numbers the caller refuses to encode without.
      const bytes = new Uint8Array(pcm.length * 2);
      const view = new DataView(bytes.buffer);
      let sumSquares = 0;
      let peak = 0;
      let clipped = 0;
      for (let i = 0; i < pcm.length; i += 1) {
        const at = i / sampleRate;
        const fade = Math.max(
          0,
          Math.min(1, at / options.fadeIn, (duration - at) / options.fadeOut),
        );
        const v = pcm[i]! * fade;
        sumSquares += v * v;
        const magnitude = Math.abs(v);
        if (magnitude > peak) peak = magnitude;
        if (magnitude >= 1) clipped += 1;
        view.setInt16(i * 2, Math.max(-32768, Math.min(32767, Math.round(v * 32767))), true);
      }

      // Per-slot level, measured before the fade, so a slot that rendered
      // silently is distinguishable from one the fade merely quietened.
      const measured = slots.map((slot): SlotMeasurement => {
        const left = Math.floor(slot.startSeconds * sampleRate);
        const right = Math.floor(slot.endSeconds * sampleRate);
        let power = 0;
        for (let i = left; i < right; i += 1) power += pcm[i]! * pcm[i]!;
        return { ...slot, rms: Math.sqrt(power / (right - left)) };
      });

      // `btoa` takes a binary string, and spreading six million arguments into
      // `fromCharCode` would overflow the stack, so it goes in 8 KB pieces.
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }

      return {
        data: btoa(binary),
        duration,
        notes: synth.noteCount,
        peak,
        rms: Math.sqrt(sumSquares / pcm.length),
        clipped,
        slots: measured,
      };
    },
    {
      plan: [...plan],
      sampleRate: SAMPLE_RATE,
      slotSeconds: SLOT_SECONDS,
      steps: STEPS_PER_SLOT,
      tailSeconds: TAIL_SECONDS,
      cueDelay: CUE_DELAY,
      volume: DEMO_VOLUME,
      masterGain: UNLOCKED_MASTER_GAIN,
      filterHz: QUESTION_FILTER_HZ,
      fadeIn: FADE_IN_SECONDS,
      fadeOut: FADE_OUT_SECONDS,
    },
  );
}

/* ------------------------------------------------------------------ *
 * Checks
 * ------------------------------------------------------------------ */

/**
 * The four things v6 refused to encode without, kept for the same reason.
 *
 * None of them is a fidelity claim — see the header — but all four are failures
 * that would otherwise ship as a plausible-looking mp3: a graph that never
 * unlocked renders 135 s of digital silence, and a scheduling mistake that
 * stacked two themes into one slot clips rather than sounding wrong.
 */
function assertPlayable(render: Render): void {
  if (render.clipped > 0) {
    throw new Error(`${String(render.clipped)} samples clipped; the mix is too hot to encode`);
  }
  if (render.peak >= 0.95) {
    throw new Error(`peak ${render.peak.toFixed(4)} is within 0.5 dB of full scale`);
  }
  const silent = render.slots.filter((slot) => slot.rms <= 0.001);
  if (silent.length > 0) {
    throw new Error(`slots with no signal: ${silent.map((slot) => String(slot.slot)).join(', ')}`);
  }
  const themes = new Set(render.slots.map((slot) => slot.themeIndex));
  if (themes.size !== GeoAudio.QUESTION_SCORES.length) {
    throw new Error(
      `the demo plays ${String(themes.size)} distinct themes, not `
        + `${String(GeoAudio.QUESTION_SCORES.length)}`,
    );
  }
}

/* ------------------------------------------------------------------ *
 * Encode
 * ------------------------------------------------------------------ */

/**
 * Pipe raw PCM straight into `ffmpeg` rather than staging a WAV.
 *
 * v6 wrote a temporary `.wav` because Python has `wave` in its standard library
 * and Node has no equivalent; hand-rolling a 44-byte RIFF header here would be
 * a second format to get wrong for no gain. `-f s16le` says everything the
 * header would have.
 */
function encodeMp3(pcm: Buffer, out: string): Promise<void> {
  return new Promise((done, fail) => {
    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', 'pipe:0',
      '-codec:a', 'libmp3lame', '-q:a', LAME_QUALITY,
      '-metadata', `title=${MP3_TITLE}`,
      out,
    ]);
    ffmpeg.on('error', fail);
    ffmpeg.on('close', (code) => {
      if (code === 0) done();
      else fail(new Error(`ffmpeg exited with ${String(code)}`));
    });
    ffmpeg.stdin.on('error', fail);
    ffmpeg.stdin.end(pcm);
  });
}

function requireFfmpeg(): void {
  const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  if (probe.error !== undefined || probe.status !== 0) {
    throw new Error('ffmpeg is not on PATH; it is what encodes the demo to mp3');
  }
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

const USAGE = 'Usage: node scripts/media/render-demo.ts [--out <file>]';

async function main(argv: readonly string[]): Promise<void> {
  let out = resolve(REPO_ROOT, DEFAULT_OUTPUT);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--out') throw new Error(USAGE);
    const value = argv[i + 1];
    if (value === undefined) throw new Error(USAGE);
    out = resolve(value);
    i += 1;
  }
  requireFfmpeg();

  const plan = planSlots();
  const script = await audioGlobalScript();
  const browser = await chromium.launch({ ...CHROMIUM_LAUNCH });
  let render: Render;
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    // A blank document is the whole harness: the synthesizer is injected, and
    // the game's own page would only add a build this script has no use for.
    await page.setContent('<!doctype html><html><head><title>demo render</title></head><body></body></html>');
    await page.addScriptTag({ content: script });
    render = await renderDemo(page, plan);
    await context.close();
  } finally {
    await browser.close();
  }
  assertPlayable(render);

  mkdirSync(dirname(out), { recursive: true });
  await encodeMp3(Buffer.from(render.data, 'base64'), out);

  for (const slot of render.slots) {
    console.log(
      `  ${String(slot.slot).padStart(2)}. theme ${String(slot.themeIndex).padStart(2)} `
        + `from bar ${String(slot.offsetStep).padStart(3)} + ${slot.cue.padEnd(9)} ${slot.name}`,
    );
  }
  console.log(
    `${String(render.slots.length)} themes, ${render.duration.toFixed(3)} s, `
      // Six places, because these are the numbers a reader compares against the
      // render this one replaced rather than numbers anybody reads for their own
      // sake, and four places hides the difference entirely.
      + `${String(render.notes)} notes, peak ${render.peak.toFixed(6)}, `
      + `rms ${render.rms.toFixed(6)}, ${String(SAMPLE_RATE)} Hz mono`,
  );
  console.log(
    `${relative(REPO_ROOT, out)} — ${statSync(out).size.toLocaleString('en-US')} bytes`,
  );
}

const invoked = process.argv[1];
if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
