/**
 * U15 — the readable single-file build.
 *
 * What is actually being defended here is R8: the game loads from a disk with
 * no network at all. The built document is the product, so the suite checks
 * the real output rather than a fixture — and checks the guard separately,
 * because a build that happens to contain no `<script src>` says nothing about
 * whether a build containing one would be caught. Every negative assertion
 * below therefore has a synthetic positive next to it.
 *
 * `file://` playability is the one scenario a Node suite cannot answer; it
 * lives in `tests/browser/readable-build.spec.ts`, which needs a browser and
 * twelve seconds of arrival animation and so is kept out of `npm test`.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  assertSelfContained,
  buildDocument,
  buildReadable,
  inlineJson,
  READABLE_OUTPUT,
  REPO_ROOT,
  SOURCE_FILES,
} from '../../scripts/build.ts';
import { copySourceTree } from '../helpers/source-tree.ts';

/** Czech text the game shows before anything is clicked, one per source. */
const CZECH_SAMPLES: readonly string[] = [
  'Zahájit expedici', // src/app/app.js, through the bundle
  'Který stát je zvýrazněný na glóbu?', // src/engine/core.ts, through the bundle
  'Česko', // data/build/countries.json
];

/** Every Czech letter that is not plain ASCII, as a `\uXXXX` escape would spell it. */
const CZECH_ESCAPES = [...'áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ'].map(
  (letter) => `\\u${letter.codePointAt(0)!.toString(16).padStart(4, '0')}`,
);

describe('readable build', () => {
  it('runs as a script and writes one self-contained file', () => {
    const out = mkdtempSync(join(tmpdir(), 'wg-readable-'));
    try {
      execFileSync('node', ['scripts/build.ts', '--out', join(out, 'index.html')], {
        cwd: REPO_ROOT,
        stdio: 'pipe',
      });

      // One file, not a file plus an assets directory: that is the deliverable.
      expect(readdirSync(out)).toEqual(['index.html']);

      const html = readFileSync(join(out, 'index.html'), 'utf8');
      expect(() => assertSelfContained(html)).not.toThrow();
      expect(html).not.toMatch(/<link\b/i);
      expect(html).not.toMatch(/<script[^>]+\bsrc\s*=/i);
      expect(html.startsWith('<!doctype html>')).toBe(true);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it('writes outside the published dist/ by default', () => {
    // Run the default target for real, on a copy, so the assertion is about
    // where the build puts the file and not only about a constant.
    const tree = copySourceTree();
    try {
      execFileSync('node', [join(REPO_ROOT, 'scripts/build.ts'), '--root', tree.root], {
        cwd: REPO_ROOT,
        stdio: 'pipe',
      });

      expect(READABLE_OUTPUT).toBe('build/readable/index.html');
      expect(existsSync(join(tree.root, READABLE_OUTPUT))).toBe(true);
      expect(existsSync(join(tree.root, 'dist'))).toBe(false);
      expect(resolve(REPO_ROOT, READABLE_OUTPUT).startsWith(join(REPO_ROOT, 'dist'))).toBe(false);

      // Outside `dist/` is only half of KTD18; the other half is that it never
      // reaches a checkout, or the obfuscated flavor guards nothing.
      expect(readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8')).toMatch(/^build\/$/m);
    } finally {
      tree.remove();
    }
  });

  it('produces identical bytes from an unchanged tree', async () => {
    // CI publishes the artifact it tested rather than rebuilding it, which is
    // only a meaningful policy if a rebuild would have matched.
    const [first, second] = await Promise.all([buildReadable(), buildReadable()]);
    expect(Buffer.from(first, 'utf8').equals(Buffer.from(second, 'utf8'))).toBe(true);
  });

  it('keeps Czech text as literal UTF-8', async () => {
    const html = await buildReadable();

    for (const sample of CZECH_SAMPLES) expect(html).toContain(sample);
    // `charset: 'utf8'` is what buys this; esbuild's default would escape
    // every accented letter and make the readable build unreadable.
    for (const escape of CZECH_ESCAPES) expect(html).not.toContain(escape);
  });

  it('carries the licence notices as plain text', async () => {
    const html = await buildReadable();
    const notices = readFileSync(join(REPO_ROOT, SOURCE_FILES.NOTICES), 'utf8');
    const block = /<script id="license-data" type="text\/plain">([\s\S]*?)<\/script>/.exec(html);

    expect(block?.[1]).toBe(notices);
    expect(notices).toContain('MIT License');
  });

  it('inlines the whole module graph into one script element, in v7 order', async () => {
    const html = await buildReadable();
    const executable = [...html.matchAll(/<script(?![^>]*\btype=)[^>]*>/gi)];

    expect(executable).toHaveLength(1);
    // The order the five v7 `<script>` tags ran in — core, clock, audio, globe,
    // app — with `themes.ts` ahead of the synthesizer it was split out of, the
    // `src/app/` modules U6 lifted out of the monolith between them, and
    // `legacy-globals.ts` after everything it publishes, which is where its own
    // imports put it until U16 removes it.
    const modules = [...html.matchAll(/^\s*\/\/ (src\/\S+)$/gm)].map((match) => match[1]);
    expect(modules).toEqual([
      'src/engine/core.ts',
      'src/engine/clock.ts',
      'src/audio/themes.ts',
      'src/audio/audio.ts',
      'src/globe/globe.ts',
      'src/app/storage.ts',
      'src/app/state.ts',
      'src/app/dialogs/help.ts',
      'src/app/dialogs/sources.ts',
      'src/app/dialogs/audio-settings.ts',
      'src/app/mobile-hud.ts',
      'src/app/views/atlas.ts',
      'src/legacy-globals.ts',
      'src/app/app.js',
    ]);
  });
});

describe('the offline guard', () => {
  // The product's citation links are `https://` text in `sources.json` and in
  // one runtime-built anchor. "Contains no http" would fail on the real
  // output, so the guard has to separate what a browser fetches from what a
  // page prints — and these two cases are what says it does.
  it('passes the shapes the real product contains', () => {
    expect(() => assertSelfContained(
      '<a href="https://research.un.org/" target="_blank" rel="noopener noreferrer">OSN ↗</a>'
      + '<img src="data:image/png;base64,iVBORw0KGgo=" alt="Vlajka">'
      + '<p>Google Noto Emoji: https://github.com/googlefonts/noto-emoji</p>',
    )).not.toThrow();
  });

  it.each([
    ['a remote script', '<script src="https://cdn.example/x.js"></script>'],
    ['a protocol-relative script', '<script src="//cdn.example/x.js"></script>'],
    ['a second local file', '<img src="flags/cz.png" alt="Vlajka">'],
    ['an embedded document', '<iframe src="data:text/html,x"></iframe>'],
    ['a script-assigned source', '<script>image.src = remoteUrl;</script>'],
    ['a stylesheet link', '<link rel="stylesheet" href="theme.css">'],
    ['a preconnect hint', '<link rel="preconnect" href="https://fonts.gstatic.com">'],
    ['a CSS import', '<style>@import url(other.css);</style>'],
    ['a remote font or image', '<style>@font-face{src:url(https://fonts.gstatic.com/a.woff2)}</style>'],
    ['a runtime fetch', '<script>fetch("/api/countries")</script>'],
    ['a websocket', '<script>new WebSocket("wss://example")</script>'],
    ['a beacon', '<script>navigator.sendBeacon("/t", "x")</script>'],
  ])('rejects %s', (_name, html) => {
    expect(() => assertSelfContained(html)).toThrow(/not self-contained/);
  });
});

describe('inlining', () => {
  // Neither guard fires on today's inputs, so the build being green says
  // nothing about them. Both are lifted copies rather than the frozen
  // concatenator's, and a lifted copy is exactly the kind that rots quietly.
  it('rejects a source that would close its host element', () => {
    expect(() => buildDocument('<script>/*__BUNDLE__*/</script>', {
      BUNDLE: { kind: 'raw', text: 'const marker = "</script>";' },
    })).toThrow(/BUNDLE.*<\/script/s);
  });

  it('escapes </ inside JSON, keeping the value parseable', () => {
    const value = '</script><script>alert(1)</script>';
    const inlined = inlineJson(JSON.stringify({ note: value }));

    expect(inlined).not.toContain('</');
    expect((JSON.parse(inlined) as { note: string }).note).toBe(value);
  });

  it('names a marker that survived substitution', () => {
    expect(() => buildDocument('<script>/*__BUNDLE__*/</script>', {})).toThrow(/BUNDLE/);
  });
});
