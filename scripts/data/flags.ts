/**
 * `npm run data:flags` — re-render the 195 flag illustrations.
 *
 * The committed PNGs are the source of truth. Neither `npm run build` nor
 * `data:refresh` reaches this module, and this module writes only when a
 * maintainer passes `--yes`, because its output is *visually* equivalent to
 * what is on disk rather than byte-identical: the glyphs arrive as CBDT colour
 * bitmaps, Skia composites them through premultiplied alpha, and the crop is
 * decided by an alpha bounding box. Thirteen of the committed images carry an
 * outermost row or column whose strongest pixel is alpha 3 to 10 — invisible,
 * and decisive for where the crop lands — so re-rendering moves thirteen crops
 * by one pixel in one dimension and leaves the other 182 exactly as they are.
 * A command that overwrote 195 images on every invocation would put 1.5 MB of
 * that churn in a diff nobody can read.
 *
 * So the command's normal answer is a report: what it would write, and which
 * crops would move. `--yes` is the whole difference between reading that and
 * acting on it.
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths, writeAtomically, type AtomicOptions, type PendingWrite } from './apply.ts';
import {
  fetchPinned,
  isoToday,
  loadLock,
  REMOTE_SOURCES,
  sha256,
  type PinStatus,
  type RemotePin,
  type Transport,
} from './sources.ts';

/**
 * The render, fixed to the geometry the committed images were cut at.
 *
 * 109 px is not a taste: `NotoColorEmoji.ttf` carries exactly one CBDT strike,
 * cut for ppem 109 and 136 px wide, so any other size resamples the artwork and
 * moves every crop. The canvas is the original's 160 x 145, which holds the
 * widest pair (131 px of ink, from x 5 to x 131) and the tallest (95 px) with
 * room to spare.
 *
 * The baseline is what has to be got right, and the two failure modes are only
 * a few pixels apart. At 135 the ink of 194 of the 195 flags runs into the last
 * row and the bottom edge is trimmed away — which happens to make three more
 * crops agree with the committed set, by deleting the same faint row the
 * committed render kept, and is a canvas artifact dressed up as fidelity. At
 * 128 every flag sits clear of all four edges with at least four pixels to
 * spare, and `touchesEdge` is what says so out loud.
 */
export const RENDER = { width: 160, height: 145, fontSize: 109, x: 0, baseline: 128 } as const;

/**
 * The narrowest ink a real flag can be.
 *
 * A code the font does not cover still draws — two boxed regional-indicator
 * letters, or a notdef — so "did it render?" cannot be answered by asking
 * whether anything appeared. The original picked 40 px against a 126 px flag
 * and it has held for 195 codes.
 *
 * It is worth being honest about what this does **not** catch. Noto covers
 * every uncovered pair with a letter-box fallback that measures 122 x 98 —
 * wider than the floor, and within a pixel or two of a real flag in both
 * dimensions — so a dataset that gained a code with no emoji flag behind it
 * would render two letters and pass. Nothing in the font distinguishes the two
 * cases: the advance, the glyph count and the ink are all a flag's. What
 * catches it instead is the report, which lists such a code as a new crop, and
 * the fact that no image is ever written without a maintainer reading that.
 */
export const MIN_BOX_WIDTH = 40;

/** `CZ` → the regional-indicator pair 🇨🇿. */
export const flagEmoji = (code: string): string =>
  [...code].map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join('');

/** One rendered or committed flag, as the encoder and the report both see it. */
export interface FlagImage {
  code: string;
  png: Uint8Array;
  width: number;
  height: number;
}

/**
 * `data/build/flags.json`: compact, key order following `countries.json`, no
 * trailing newline — the shape `prepare_flags.py` wrote and the build inlines.
 */
export const serializeFlags = (images: readonly FlagImage[]): string =>
  JSON.stringify(
    Object.fromEntries(
      images.map((image) => [image.code, `data:image/png;base64,${Buffer.from(image.png).toString('base64')}`]),
    ),
  );

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The tightest rectangle holding every pixel the font left any alpha in.
 *
 * Any alpha at all, down to 1/255 — which is the whole reason a re-render is
 * not byte-identical. Thirteen of the committed images carry an outermost row
 * or column whose strongest pixel is alpha 3 to 10, invisible on any screen but
 * decisive for where the crop lands, and a stack that composites through
 * premultiplied alpha rounds some of them away. Thresholding here would not fix
 * that; it would only move the disagreement somewhere less visible.
 */
export function alphaBox(pixels: Uint8ClampedArray | Uint8Array, width: number, height: number): Box | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * Whether a box runs into the edge of the canvas it was measured on.
 *
 * A crop that starts at the edge cannot be trusted to be the glyph's outline:
 * the ink may have continued past it. Cheap to ask, and the only thing
 * standing between a mis-sized canvas and 195 quietly trimmed images.
 */
export const touchesEdge = (box: Box, width: number, height: number): boolean =>
  box.x === 0 || box.y === 0 || box.x + box.width >= width || box.y + box.height >= height;

/** One attempt at one code. `null` is a canvas the font left untouched. */
export type FlagRenderer = (code: string) => FlagImage | null;

/**
 * Renders every code, or fails naming the first one that did not come out.
 *
 * All-or-nothing on purpose: the caller writes 195 PNGs and one `flags.json`
 * as a single set, so a run that rendered 194 flags and gave up has nothing to
 * offer. The error names the code because that is the only thing the maintainer
 * can act on — either the font moved, or the dataset gained a code with no
 * emoji flag behind it.
 */
export function renderFlags(codes: readonly string[], render: FlagRenderer): FlagImage[] {
  return codes.map((code) => {
    const image = render(code);
    if (image === null) {
      throw new Error(
        `no flag glyph for ${code}: the font drew nothing. Either the pinned font does not cover ` +
          `${flagEmoji(code)} or ${code} is not a regional-indicator pair.`,
      );
    }
    if (image.width < MIN_BOX_WIDTH) {
      throw new Error(
        `no flag glyph for ${code}: the ink is ${image.width} px wide, under the ${MIN_BOX_WIDTH} px a flag ` +
          `takes. The font drew ${flagEmoji(code)} as letters or a notdef rather than as a flag.`,
      );
    }
    return { ...image, code };
  });
}

/** Width and height out of a PNG's IHDR, so the report can read a file's geometry. */
export function pngSize(png: Uint8Array): { width: number; height: number } {
  const view = Buffer.from(png.buffer, png.byteOffset, png.byteLength);
  if (view.length < 24 || view.readUInt32BE(12) !== 0x49484452) throw new Error('not a PNG');
  return { width: view.readUInt32BE(16), height: view.readUInt32BE(20) };
}

/**
 * The committed images, in the dataset's order, skipping codes that have none.
 *
 * Skipping rather than throwing because this command is how a flag gets
 * *created*, not only how it gets replaced: a dataset that gained a country has
 * no image for it yet, and that belongs in the report as a new crop rather than
 * as an ENOENT from a read of a file nobody claimed was there. `data:check` is
 * what fails when a shipped country has no flag.
 */
export function readFlagImages(dir: string, codes: readonly string[]): FlagImage[] {
  const images: FlagImage[] = [];
  for (const code of codes) {
    const path = join(dir, `${code}.png`);
    if (!existsSync(path)) continue;
    const png = readFileSync(path);
    images.push({ code, png, ...pngSize(png) });
  }
  return images;
}

// --------------------------------------------------------------- the report

/** One country whose re-render does not land on the committed crop. */
export interface GeometryDelta {
  code: string;
  /** `null` when the dataset gained a code that has no image yet. */
  from: { width: number; height: number } | null;
  to: { width: number; height: number };
}

export function geometryDeltas(
  before: readonly FlagImage[],
  after: readonly FlagImage[],
): GeometryDelta[] {
  const committed = new Map(before.map((image) => [image.code, image]));
  const deltas: GeometryDelta[] = [];
  for (const image of after) {
    const was = committed.get(image.code);
    const to = { width: image.width, height: image.height };
    if (was === undefined) deltas.push({ code: image.code, from: null, to });
    else if (was.width !== to.width || was.height !== to.height) {
      deltas.push({ code: image.code, from: { width: was.width, height: was.height }, to });
    }
  }
  return deltas;
}

// -------------------------------------------------------------- the command

export interface FlagsOptions extends FontOptions {
  /** Renders one code. A test seam; otherwise the pinned font's renderer. */
  render?: FlagRenderer;
  /** Nothing is written without this. */
  confirm?: boolean;
  atomic?: AtomicOptions;
}

export interface FlagsResult {
  report: string[];
  deltas: GeometryDelta[];
  written: boolean;
  writes: PendingWrite[];
}

export async function regenerateFlags(options: FlagsOptions = {}): Promise<FlagsResult> {
  const at = paths(options.root);
  const codes = (JSON.parse(readFileSync(at.countries, 'utf8')) as { code: string }[]).map(
    (country) => country.code,
  );
  // The font is resolved whenever one is named or needed. `render` replaces the
  // drawing so the guards and the write path can be exercised without a 10 MB
  // download; it does not replace the question of *which* font is on disk.
  let render = options.render;
  let font: ResolvedFont | undefined;
  if (options.fontPath !== undefined || render === undefined) {
    font = await resolveFont(options);
    render ??= notoRenderer(font.path);
  }
  if (render === undefined) throw new Error('data:flags has no way to draw: pass --font-path or a renderer');

  const committed = readFlagImages(at.flagsDir, codes);
  const rendered = renderFlags(codes, render);
  const deltas = geometryDeltas(committed, rendered);
  const onDisk = new Map(committed.map((image) => [image.code, image.png]));
  const changed = rendered.filter(
    (image) => !Buffer.from(image.png).equals(Buffer.from(onDisk.get(image.code) ?? new Uint8Array())),
  );

  const writes: PendingWrite[] = [
    ...rendered.map((image) => ({ path: join(at.flagsDir, `${image.code}.png`), text: image.png })),
    { path: at.flags, text: serializeFlags(rendered) },
  ];

  const report: string[] = [
    `data:flags — ${codes.length} flags re-rendered at ${RENDER.fontSize} px`,
    ...(font === undefined
      ? []
      : ['', `  font [${font.status}] ${font.pin.bytes} B  sha256 ${font.pin.sha256}`, `    ${font.path}`]),
    '',
    `  ${changed.length} of ${codes.length} images differ from the committed bytes`,
    deltas.length === 0
      ? '  every crop lands on the committed geometry'
      : `  ${deltas.length} crops move:`,
    ...deltas.map(
      (delta) =>
        `    ${delta.code} ${delta.from === null ? '(new)' : `${delta.from.width}x${delta.from.height}`} -> ` +
        `${delta.to.width}x${delta.to.height}`,
    ),
  ];

  if (options.confirm !== true) {
    report.push(
      '',
      'Report only — assets/flags/ was not modified. A re-render is visually equivalent but not',
      'byte-identical, so re-run with --yes once you have read the geometry above.',
    );
    return { report, deltas, written: false, writes };
  }

  // The notices name a sha256, and these images are the only thing that sha
  // describes. Writing from unpinned bytes would make that credit false in the
  // one direction `data:check` cannot catch: the lock would still agree with
  // the notices it generated, and only the images would have moved.
  if (font !== undefined && font.status !== 'pinned' && font.status !== 'cached') {
    throw new Error(
      `${font.path} is not the font data/raw/sources.lock.json pins, so --yes is refused.\n` +
        `  pinned : ${font.previous?.sha256 ?? '(no pin)'}\n` +
        `  on disk: ${font.pin.sha256}\n` +
        `To adopt this font, update the noto-emoji pin in data/raw/sources.lock.json and regenerate ` +
        `the provenance, then re-run. \`npm run data:check\` fails until the notices credit the new hash.`,
    );
  }

  writeAtomically(writes, options.atomic ?? {});
  report.push('', `Written. ${writes.length} files replaced atomically.`);
  return { report, deltas, written: true, writes };
}

// ---------------------------------------------------------------- the font

export interface FontOptions {
  root?: string;
  /** A local copy, for when the pinned URL dies. Verified against the pin all the same. */
  fontPath?: string;
  acceptSourceChange?: boolean;
  cached?: boolean;
  cacheDir?: string;
  transport?: Transport;
  today?: string;
}

export interface ResolvedFont {
  path: string;
  status: PinStatus;
  pin: RemotePin;
  /** The pin the lock held, when this run is reading different bytes. */
  previous?: RemotePin;
}

/**
 * Finds the font, and proves it is the one the committed images came from.
 *
 * `--font-path` is checked against the pin too. The flag exists so the command
 * survives the URL dying, not so it can render from whatever font is lying
 * around: a local copy that hashes differently is a different font, and the
 * only difference it would make is 195 quietly different images.
 */
export async function resolveFont(options: FontOptions = {}): Promise<ResolvedFont> {
  const at = paths(options.root);
  const lock = loadLock(at.lock);
  const source = REMOTE_SOURCES['noto-emoji'];
  if (source === undefined) throw new Error('no noto-emoji source is declared');

  if (options.fontPath === undefined) {
    const result = await fetchPinned('noto-emoji', {
      lock,
      acceptSourceChange: options.acceptSourceChange === true,
      cached: options.cached === true,
      cacheDir: options.cacheDir ?? join(at.root, '.cache'),
      ...(options.today === undefined ? {} : { today: options.today }),
      ...(options.transport === undefined ? {} : { transport: options.transport }),
    });
    return {
      path: join(options.cacheDir ?? join(at.root, '.cache'), source.cacheFile),
      status: result.status,
      pin: result.pin,
      ...(result.previous === undefined ? {} : { previous: result.previous }),
    };
  }

  const bytes = readFileSync(options.fontPath);
  const digest = sha256(bytes);
  const previous = lock.remote['noto-emoji'];
  const pin: RemotePin = {
    url: previous?.url ?? source.url,
    sha256: digest,
    bytes: bytes.byteLength,
    accessed: options.today ?? isoToday(),
  };
  if (previous !== undefined && previous.sha256 !== digest && options.acceptSourceChange !== true) {
    throw new Error(
      `${options.fontPath} is not the pinned font.\n` +
        `  pinned : ${previous.sha256} (${previous.bytes} B, ${previous.accessed})\n` +
        `  on disk: ${digest} (${bytes.byteLength} B)\n` +
        `The committed images were rendered from the pinned bytes, so a different font means 195 ` +
        `different images. Re-run with --accept-source-change once you have decided that is what you want.`,
    );
  }
  return {
    path: options.fontPath,
    status: previous === undefined ? 'new' : previous.sha256 === digest ? 'pinned' : 'changed',
    pin,
    ...(previous === undefined || previous.sha256 === digest ? {} : { previous }),
  };
}

/**
 * The real renderer: one registered font, one reused canvas.
 *
 * `@napi-rs/canvas` registers the family under a private name so the render
 * cannot fall through to whatever colour emoji font the machine has installed —
 * on a Mac that is Apple Color Emoji, whose flags are a different drawing
 * entirely, and the fallback would be silent.
 *
 * The canvas is created once and cleared between codes. 195 canvases would be
 * 195 Skia surfaces for no gain, and the clear is what the crop depends on
 * anyway: a stale pixel from the previous flag would widen the next one's box.
 */
export function notoRenderer(fontPath: string, family = 'WG Noto Color Emoji'): FlagRenderer {
  if (!GlobalFonts.registerFromPath(fontPath, family)) {
    throw new Error(`${fontPath} could not be registered as a font`);
  }
  const canvas = createCanvas(RENDER.width, RENDER.height);
  const context = canvas.getContext('2d');
  context.font = `${RENDER.fontSize}px "${family}"`;
  context.textBaseline = 'alphabetic';

  return (code) => {
    context.clearRect(0, 0, RENDER.width, RENDER.height);
    context.fillText(flagEmoji(code), RENDER.x, RENDER.baseline);
    const box = alphaBox(
      context.getImageData(0, 0, RENDER.width, RENDER.height).data,
      RENDER.width,
      RENDER.height,
    );
    if (box === null) return null;
    if (touchesEdge(box, RENDER.width, RENDER.height)) {
      throw new Error(
        `${code} renders into the edge of the ${RENDER.width}x${RENDER.height} canvas ` +
          `(ink at ${box.x},${box.y} sized ${box.width}x${box.height}), so the crop would be the canvas's ` +
          `outline rather than the glyph's. The font has grown past the canvas this command renders into.`,
      );
    }
    const cropped = createCanvas(box.width, box.height);
    cropped.getContext('2d').drawImage(canvas, -box.x, -box.y);
    return { code, png: cropped.toBuffer('image/png'), width: box.width, height: box.height };
  };
}

// ---------------------------------------------------------------- the CLI

const USAGE = [
  'usage: npm run data:flags -- [--yes] [--font-path <file>] [--cached] [--accept-source-change]',
  '',
  '  Re-renders assets/flags/*.png and data/build/flags.json from the pinned',
  '  Noto Color Emoji release. Reports and writes nothing unless --yes is given.',
].join('\n');

const invoked = process.argv[1];
if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flag = (name: string): boolean => argv.includes(`--${name}`);
  const value = (name: string): string | undefined => {
    const at = argv.indexOf(`--${name}`);
    return at < 0 ? undefined : argv[at + 1];
  };
  if (flag('help')) console.log(USAGE);
  else {
    const root = value('root');
    const fontPath = value('font-path');
    regenerateFlags({
      ...(root === undefined ? {} : { root }),
      ...(fontPath === undefined ? {} : { fontPath }),
      confirm: flag('yes'),
      cached: flag('cached'),
      acceptSourceChange: flag('accept-source-change'),
    })
      .then((result) => console.log(result.report.join('\n')))
      .catch((error: unknown) => {
        console.error(
          `data:flags failed — nothing was written.\n${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      });
  }
}
