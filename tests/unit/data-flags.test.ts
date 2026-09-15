/**
 * U10 — `npm run data:flags`, the flag regeneration command.
 *
 * The committed PNGs are the source of truth, not this command: nothing in the
 * build or the refresh reaches it, and it writes only when a maintainer says
 * so. So most of what is worth testing here is what it refuses to do — render
 * a code the font has no glyph for, overwrite 195 images without being asked,
 * or leave `flags.json` describing PNGs that a failed write never replaced.
 *
 * The font is a 10 MB download that is never committed, so the scenarios that
 * need real glyphs are gated on it being in `.cache/` (or named by
 * `WG_NOTO_FONT`) and skip everywhere else, exactly as the network suite does.
 * Everything that can be proved without glyphs — the guards, the confirmation
 * gate, the atomic set, the `flags.json` encoding — runs offline in CI.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  alphaBox,
  flagEmoji,
  pngSize,
  regenerateFlags,
  renderFlags,
  serializeFlags,
  readFlagImages,
  resolveFont,
  notoRenderer,
  touchesEdge,
  MIN_BOX_WIDTH,
  type FlagRenderer,
} from '../../scripts/data/flags.ts';
import { loadLock, type Transport } from '../../scripts/data/sources.ts';
import type { LocalizedCountry } from '../../src/engine/types.ts';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const at = (relative: string) => join(REPO, relative);
const codes = (JSON.parse(readFileSync(at('data/build/countries.json'), 'utf8')) as LocalizedCountry[]).map(
  (country) => country.code,
);

/** A rendered flag of a given width, standing in for glyphs the suite has no font for. */
const stub = (width: number) => ({ code: '', png: new Uint8Array(), width, height: 94 });

describe('data/build/flags.json', () => {
  it('is exactly what the committed PNGs encode', () => {
    // The flags.json a run writes is derived from the images it just wrote, so
    // the two can only disagree if the encoding drifted. Rebuilding from the
    // untouched PNGs and comparing bytes is the cheapest way to say so, and it
    // is also what makes a regeneration reviewable: the JSON moves when and
    // only when a PNG moved.
    const rebuilt = serializeFlags(readFlagImages(at('assets/flags'), codes));
    expect(rebuilt).toBe(readFileSync(at('data/build/flags.json'), 'utf8'));
  });
});

describe('the render guards', () => {
  it('maps a country code to its regional-indicator pair', () => {
    expect([...flagEmoji('CZ')].map((ch) => ch.codePointAt(0)?.toString(16))).toEqual(['1f1e8', '1f1ff']);
  });

  it('crops to the alpha bounding box, ignoring fully transparent pixels', () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    const ink = (x: number, y: number, alpha: number) => {
      pixels[(y * 4 + x) * 4 + 3] = alpha;
    };
    ink(1, 2, 255);
    ink(2, 2, 7);

    expect(alphaBox(pixels, 4, 4)).toEqual({ x: 1, y: 2, width: 2, height: 1 });
  });

  it('reports no box at all for a canvas the font never drew on', () => {
    expect(alphaBox(new Uint8ClampedArray(4 * 4 * 4), 4, 4)).toBeNull();
  });

  it('treats ink that reaches the canvas edge as a crop the canvas decided', () => {
    // The crop has to be the glyph's, not the canvas's. A baseline two pixels
    // too low silently trims the faint bottom row off 194 of the 195 flags and
    // still looks like a clean render, so the only way to see it is to ask
    // whether the ink stops short of every edge.
    expect(touchesEdge({ x: 5, y: 44, width: 126, height: 94 }, 160, 145)).toBe(false);
    expect(touchesEdge({ x: 0, y: 44, width: 126, height: 94 }, 160, 145)).toBe(true);
    expect(touchesEdge({ x: 5, y: 50, width: 126, height: 95 }, 160, 145)).toBe(true);
  });

  it('fails naming the code when the font has no glyph for it', () => {
    expect(() => renderFlags(['CZ', 'ZZ'], (code) => (code === 'CZ' ? stub(126) : null))).toThrow(/\bZZ\b/);
  });

  it('fails naming the code when the glyph comes out narrower than 40 px', () => {
    // The original's missing-glyph guard: a code the font does not cover still
    // draws something — two boxed letters, a notdef — and the only signal that
    // separates that from a flag is how wide the ink is.
    expect(() => renderFlags(['CZ', 'XK'], (code) => (code === 'CZ' ? stub(126) : stub(39)))).toThrow(
      /XK[\s\S]*39 px/,
    );
  });
});

// ------------------------------------------------------------ the command

const trash: (() => void)[] = [];
afterEach(() => {
  while (trash.length > 0) trash.pop()?.();
});

/** Three real flags in a throwaway tree: the repository is never written to. */
function fixture(): { root: string; read: (relative: string) => Buffer } {
  const root = mkdtempSync(join(tmpdir(), 'wg-flags-'));
  trash.push(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'data/build'), { recursive: true });
  mkdirSync(join(root, 'data/raw'), { recursive: true });
  copyFileSync(at('data/raw/sources.lock.json'), join(root, 'data/raw/sources.lock.json'));
  mkdirSync(join(root, 'assets/flags'), { recursive: true });
  writeFileSync(
    join(root, 'data/build/countries.json'),
    JSON.stringify(THREE.map((code) => ({ code }))),
  );
  for (const code of THREE) copyFileSync(at(`assets/flags/${code}.png`), join(root, 'assets/flags', `${code}.png`));
  writeFileSync(join(root, 'data/build/flags.json'), serializeFlags(readFlagImages(join(root, 'assets/flags'), THREE)));
  return { root, read: (relative) => readFileSync(join(root, relative)) };
}

const THREE = ['CZ', 'US', 'NP'];

/** Renders CZ and US back as they are, and NP as a different shape. */
const swapNepal: FlagRenderer = (code) => {
  const png = readFileSync(at(`assets/flags/${code === 'NP' ? 'CH' : code}.png`));
  return { code, png, ...pngSize(png) };
};

describe('data:flags', () => {
  it('reports the per-country geometry it would change', async () => {
    const place = fixture();
    const result = await regenerateFlags({ root: place.root, render: swapNepal });

    expect(result.deltas).toEqual([{ code: 'NP', from: { width: 90, height: 87 }, to: { width: 98, height: 94 } }]);
    expect(result.report.join('\n')).toContain('NP 90x87 -> 98x94');
  });

  it('reports a country that has no image yet as a new crop', async () => {
    // The command is how a flag gets created, not only how it gets replaced,
    // so a dataset that gained a code has to reach the report rather than an
    // ENOENT from the read of an image that was never there.
    const place = fixture();
    rmSync(join(place.root, 'assets/flags/NP.png'));

    const result = await regenerateFlags({ root: place.root, render: swapNepal });

    expect(result.deltas).toEqual([{ code: 'NP', from: null, to: { width: 98, height: 94 } }]);
    expect(result.report.join('\n')).toContain('NP (new) -> 98x94');
  });

  it('leaves assets/flags/ untouched when the run is not confirmed', async () => {
    const place = fixture();
    const before = place.read('assets/flags/NP.png');

    const result = await regenerateFlags({ root: place.root, render: swapNepal });

    expect(result.written).toBe(false);
    expect(place.read('assets/flags/NP.png').equals(before)).toBe(true);
    expect(result.report.join('\n')).toContain('--yes');
  });

  it('rewrites the images and flags.json together once confirmed', async () => {
    const place = fixture();

    const result = await regenerateFlags({ root: place.root, render: swapNepal, confirm: true });

    expect(result.written).toBe(true);
    expect(pngSize(place.read('assets/flags/NP.png'))).toEqual({ width: 98, height: 94 });
    expect(place.read('data/build/flags.json').toString('utf8')).toBe(
      serializeFlags(readFlagImages(join(place.root, 'assets/flags'), THREE)),
    );
  });

  it('refuses to write images rendered from a font the notices do not credit', async () => {
    // --accept-source-change lets a maintainer *look* at what a new font
    // release would do. Writing is a separate decision, because the notices
    // name a sha256 and the images are the only thing on the page that sha
    // describes: 195 images from unpinned bytes would make the credit false in
    // the one direction `data:check` cannot see, since the lock would still
    // agree with the notices it was generated from.
    const place = fixture();

    await expect(
      regenerateFlags({
        root: place.root,
        render: swapNepal,
        fontPath: at('package.json'),
        acceptSourceChange: true,
        confirm: true,
      }),
    ).rejects.toThrow(/sources\.lock\.json/);

    expect(pngSize(place.read('assets/flags/NP.png'))).toEqual({ width: 90, height: 87 });
  });

  it('still reports what an unpinned font would render, without writing', async () => {
    const place = fixture();

    const result = await regenerateFlags({
      root: place.root,
      render: swapNepal,
      fontPath: at('package.json'),
      acceptSourceChange: true,
    });

    expect(result.written).toBe(false);
    expect(result.deltas.map((delta) => delta.code)).toEqual(['NP']);
  });

  it('leaves the previous images and flags.json agreeing when a write is interrupted', async () => {
    // A half-written set is the one outcome that is worse than not running at
    // all: `flags.json` would describe images that are no longer on disk, and
    // the build inlines `flags.json`, so the game would ship a flag nobody can
    // find the source of.
    const place = fixture();
    const before = THREE.map((code) => place.read(`assets/flags/${code}.png`));
    const beforeJson = place.read('data/build/flags.json');

    await expect(
      regenerateFlags({ root: place.root, render: swapNepal, confirm: true, atomic: { failAfter: 2 } }),
    ).rejects.toThrow(/simulated failure/);

    THREE.forEach((code, i) => expect(place.read(`assets/flags/${code}.png`).equals(before[i]!)).toBe(true));
    expect(place.read('data/build/flags.json').equals(beforeJson)).toBe(true);
  });
});

// ---------------------------------------------------------------- the font

const refuse: Transport = () => {
  throw new Error('the font resolution reached the network');
};

describe('the pinned font', () => {
  it('is content-pinned in sources.lock.json', () => {
    // Version-pinning a font is not enough for the same reason it is not enough
    // for the WPP CSV: the artwork behind a flag can be redrawn inside a
    // release, and a redrawn flag is a silently different image in the game.
    const pin = loadLock(at('data/raw/sources.lock.json')).remote['noto-emoji'];

    expect(pin?.url).toContain('NotoColorEmoji.ttf');
    expect(pin?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(pin?.bytes).toBeGreaterThan(1_000_000);
  });

  it('is credited by hash everywhere the other pinned downloads are', () => {
    // `data:check` asserts this for every entry in `lock.remote`, and it is the
    // rule that makes the lock worth keeping: a pin nothing credits is a
    // download whose output ships unattributed. The flags are the one shipped
    // artefact a player looks at directly.
    const pin = loadLock(at('data/raw/sources.lock.json')).remote['noto-emoji'];
    const entries = JSON.parse(readFileSync(at('data/build/sources.json'), 'utf8')) as { url: string }[];

    for (const file of ['data/embedded-notices.txt', 'THIRD_PARTY_NOTICES.txt']) {
      expect(readFileSync(at(file), 'utf8')).toContain(pin!.sha256);
    }
    expect(entries.map((entry) => entry.url)).toContain(pin!.url);
  });

  it('refuses a --font-path copy that is not the pinned bytes', async () => {
    await expect(
      resolveFont({ fontPath: at('package.json'), transport: refuse }),
    ).rejects.toThrow(/--accept-source-change/);
  });

  it('takes a --font-path copy without touching the network', async () => {
    // The point of the flag is that the command outlives the URL, so it must
    // not reach for the network even to confirm what it was handed.
    const font = await resolveFont({
      fontPath: at('package.json'),
      acceptSourceChange: true,
      transport: refuse,
    });

    expect(font.path).toBe(at('package.json'));
    expect(font.status).toBe('changed');
  });
});

// ----------------------------------------------------- rendering for real
//
// Gated on the font, which is a 10 MB download that is deliberately never
// committed. `npm test` therefore skips this block in CI and anywhere the
// maintainer has not run the command; `npm run data:flags` fetches the font
// into `.cache/`, after which these run on every `npm test`.

const fontPath = process.env['WG_NOTO_FONT'] ?? at('.cache/NotoColorEmoji.ttf');
const haveFont = existsSync(fontPath);

describe.skipIf(!haveFont)('the pinned font, rendering for real', () => {
  it('draws all 195 flags wider than the missing-glyph floor', () => {
    const rendered = renderFlags(codes, notoRenderer(fontPath));

    expect(rendered).toHaveLength(195);
    const narrowest = Math.min(...rendered.map((image) => image.width));
    expect(narrowest).toBeGreaterThanOrEqual(MIN_BOX_WIDTH);
  });

  it('draws all 195 flags clear of the canvas edge', () => {
    // Not a restatement of the guard: this is the assertion that the 160 x 145
    // canvas and the 109 px strike still fit each other. It is what would go
    // red if a future font release drew a taller flag.
    expect(() => renderFlags(codes, notoRenderer(fontPath))).not.toThrow();
  });

  it('renders from the pinned font when the caller injects no renderer', async () => {
    // The seam the rest of this file uses is a test seam; this is the path a
    // maintainer actually runs, font resolution included.
    const place = fixture();

    const result = await regenerateFlags({ root: place.root, fontPath });

    expect(result.deltas).toEqual([]);
    expect(result.written).toBe(false);
  });

  it('writes a real render through the whole command once confirmed', async () => {
    // The plan's verification, run against a copy: the repository's own PNGs
    // are the source of truth and re-rendering them is a reviewed decision, not
    // something a test run gets to make.
    const place = fixture();

    const result = await regenerateFlags({ root: place.root, fontPath, confirm: true });

    expect(result.written).toBe(true);
    expect(result.deltas).toEqual([]);
    expect(place.read('data/build/flags.json').toString('utf8')).toBe(
      serializeFlags(readFlagImages(join(place.root, 'assets/flags'), THREE)),
    );
  });

  it('reproduces the committed crop for CZ, US, NP, CH and AF', () => {
    // The five the plan names, and the two that matter: Nepal is the only
    // non-rectangular flag in the set and Switzerland the only square one, so
    // they are where a resampled strike or a shifted baseline would show up
    // first.
    const witnesses = ['CZ', 'US', 'NP', 'CH', 'AF'];
    const rendered = renderFlags(witnesses, notoRenderer(fontPath));

    expect(rendered.map((image) => `${image.code} ${image.width}x${image.height}`)).toEqual(
      readFlagImages(at('assets/flags'), witnesses).map(
        (image) => `${image.code} ${image.width}x${image.height}`,
      ),
    );
  });
});

// --------------------------------------------------- what must not happen

/** Every repository file, minus the directories no distribution is cut from. */
function walk(dir: string, into: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.cache', 'dist', 'build', 'test-results'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, into);
    else if (entry.isFile()) into.push(path.slice(REPO.length));
  }
  return into;
}

/** `scripts/x.ts` plus everything it reaches through a relative import. */
function importGraph(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  const text = readFileSync(join(REPO, entry), 'utf8');
  for (const match of text.matchAll(/from '(\.[^']+)'/g)) {
    importGraph(join(dirname(entry), match[1]!), seen);
  }
  return seen;
}

describe('the font never ships and never leaks into another command', () => {
  it('leaves no font file anywhere in the tree', () => {
    // THIRD_PARTY_NOTICES.txt states that no font files are distributed, and
    // the OFL notice ships on that basis. `.cache/` is the only place the 10 MB
    // download is allowed to land, and `.gitignore` keeps it out of the commit.
    expect(walk(REPO).filter((path) => /\.(ttf|otf|ttc|woff2?)$/i.test(path))).toEqual([]);
  });

  it('keeps the font out of the build and the refresh', () => {
    // R14: the committed PNGs are the source of truth. A build that quietly
    // pulled 10 MB of font would also mean a build whose output depends on a
    // network, which is the one thing this project's offline promise rules out.
    for (const entry of ['scripts/build.ts', 'scripts/data/refresh.ts']) {
      const graph = [...importGraph(entry)];
      expect(graph).not.toContain('scripts/data/flags.ts');
      expect(graph.filter((file) => readFileSync(join(REPO, file), 'utf8').includes("fetchPinned('noto-emoji'"))).toEqual([]);
    }
  });
});
