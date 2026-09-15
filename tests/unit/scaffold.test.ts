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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STYLE_FILES, readStylesheet } from '../../scripts/build.ts';
import { DECLARED_STYLE_CHANGES, canonicalDifferences, parseStylesheet } from '../helpers/css.ts';

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

  it('resolves the split stylesheet to what the frozen copy resolved to', () => {
    // Until U7 this was a byte-identity check, and it stopped being one the
    // moment the monolith was split by component. What survives it is the claim
    // it was standing in for: every selector still resolves to the declarations
    // it had, apart from the five `DECLARED_STYLE_CHANGES` names and explains.
    // `tests/browser/styles.spec.ts` is the other half, and the half that can
    // say the rules are still in the right order.
    const differences = canonicalDifferences(
      parseStylesheet(read('tests/fixtures/baseline/style.css').toString('utf8')),
      parseStylesheet(readStylesheet()),
    );
    expect(differences).toEqual([...DECLARED_STYLE_CHANGES]);
  });

  it('leaves no monolith for the build to inline twice', () => {
    expect(existsSync(new URL('src/style.css', `file://${root}`))).toBe(false);
    expect(readdirSync(new URL('src/styles', `file://${root}`)).sort()).toEqual(
      STYLE_FILES.map((relative) => relative.slice('src/styles/'.length)).sort(),
    );
  });

  it('tracks the committed baseline dataset', () => {
    // `data/build/` is the diff baseline `data:refresh` compares against and
    // refuses to overwrite when dirty, so it has to be in the repository. An
    // unanchored `build/` rule in .gitignore matches at any depth and silently
    // excluded all four files, leaving a checkout that could not build.
    const tracked = execFileSync('git', ['ls-files', 'data/build'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((p) => p !== '')
      .sort();

    expect(tracked).toEqual([
      'data/build/countries.json',
      'data/build/flags.json',
      'data/build/map.json',
      'data/build/sources.json',
    ]);
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
        // U12: the English half of the dataset is generated, so the side-by-side
        // a reviewer signs it off from has to be generated too.
        'data:review',
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
      execFileSync('node', ['scripts/unimplemented.ts', 'test:browser', 'U14'], {
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
    expect(stderr).toContain('U14');
  });

  it('pins the two dependencies whose output must be reproducible', () => {
    // The obfuscator's transforms and the canvas rasterizer both change output
    // across minor versions; a caret range would silently move the artifact.
    expect(pkg.devDependencies['javascript-obfuscator']).toBe('5.7.0');
    expect(pkg.devDependencies['@napi-rs/canvas']).toBe('1.0.9');
  });
});
