/**
 * U1 — structural guards over the rescued project layout.
 *
 * These assert the shape of the tree rather than any behavior: once
 * `original-source/` is deleted in U14 there is no second copy of these
 * assets, so a silently missing flag or baseline fixture would only surface
 * much later, as a build that cannot reproduce the v7 hash.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (p: string) => readFileSync(new URL(p, `file://${root}`));
const readJson = (p: string) => JSON.parse(read(p).toString('utf8')) as unknown;

describe('rescued assets', () => {
  it('ships one flag PNG per country code, and no extras', () => {
    const countries = readJson('data/build/countries.json') as { code: string }[];
    const codes = countries.map((c) => c.code).sort();
    const flags = readdirSync(new URL('assets/flags', `file://${root}`)).sort();

    expect(codes).toHaveLength(195);
    expect(flags).toEqual(codes.map((code) => `${code}.png`));
  });

  it('freezes every input the byte-identity gate reads', () => {
    const listing = (dir: string) =>
      readdirSync(new URL(`tests/fixtures/baseline/${dir}`, `file://${root}`)).sort();

    expect(listing('')).toEqual(
      ['data', 'embedded-notices.txt', 'index.template.html', 'js', 'runs', 'style.css', 'v7-index.html'],
    );
    expect(listing('js')).toEqual(['app.js', 'audio.js', 'clock.js', 'core.js', 'globe.js']);
    expect(listing('data')).toEqual(['countries.json', 'flags.json', 'map.json', 'sources.json']);
  });

  it('keeps the live style.css byte-identical to the frozen copy', () => {
    // U2 builds from the frozen copy; the build only reproduces the v7 hash
    // while the live input it will later use still matches it.
    expect(read('src/style.css').equals(read('tests/fixtures/baseline/style.css'))).toBe(true);
  });

  it('leaves no Python in the project outside the archive and original-source', () => {
    const tracked = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '*.py'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((p) => p !== '' && !p.startsWith('original-source/'));

    expect(tracked).toEqual([]);
  });
});

describe('command surface', () => {
  const pkg = readJson('package.json') as {
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  it('declares every command the project will have', () => {
    expect(Object.keys(pkg.scripts).sort()).toEqual(
      [
        'build',
        'build:readable',
        'data:apply',
        'data:check',
        'data:flags',
        'data:refresh',
        'dev',
        'simulate',
        'test',
        'test:browser',
        'typecheck',
        'verify:baseline',
      ],
    );
  });

  it('fails an unimplemented command loudly, naming the unit that owns it', () => {
    // Exiting 0 here would let CI report a green run for work that never ran.
    let status = 0;
    let stderr = '';
    try {
      execFileSync('node', ['scripts/unimplemented.ts', 'data:flags', 'U10'], {
        cwd: root,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error) {
      const failure = error as { status: number; stderr: string };
      status = failure.status;
      stderr = failure.stderr;
    }

    expect(status).toBe(1);
    expect(stderr).toContain('U10');
  });

  it('pins the two dependencies whose output must be reproducible', () => {
    // The obfuscator's transforms and the canvas rasterizer both change output
    // across minor versions; a caret range would silently move the artifact.
    expect(pkg.devDependencies['javascript-obfuscator']).toBe('5.7.0');
    expect(pkg.devDependencies['@napi-rs/canvas']).toBe('1.0.9');
  });
});
