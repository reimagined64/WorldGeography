/**
 * U1 — structural guards over the rescued project layout.
 *
 * These assert the shape of the tree rather than any behavior. U14 deleted the
 * rescued `original-source/`, so there is no second copy of these assets any
 * more: a silently missing flag or baseline fixture would otherwise surface
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

  it('leaves no Python anywhere in the project', () => {
    // R1. Until U14 this filtered `original-source/` out, because the rescued
    // v7 tree still held the Python the port was measured against. U14 deleted
    // that tree — everything the suites still read was copied into
    // `tests/fixtures/baseline/` in U1 — so the exception goes with it and the
    // claim becomes the unqualified one the requirement actually makes.
    const tracked = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '*.py'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((p) => p !== '');

    expect(tracked).toEqual([]);
  });

  it('has no rescued source tree left to read from', () => {
    // The whole point of freezing the fixtures in U1 was that this directory
    // could go. A suite that quietly started reading it again would keep
    // passing here and fail for everyone who cloned the repository afterwards.
    expect(existsSync(new URL('original-source', `file://${root}`))).toBe(false);

    // Quoted rather than bare, so this finds a path a file could actually be
    // opened at and not the handful of comments that explain what used to be
    // there. This file is excluded because it is the one that has to name the
    // directory in order to say it is gone. `git grep` exits 1 when it matches
    // nothing, which is the passing case and not an error.
    let referring: string[] = [];
    try {
      referring = execFileSync(
        'git',
        ['grep', '-lE', "['\"]original-source", '--', ':!docs/plans/', ':!tests/unit/scaffold.test.ts'],
        { cwd: root, encoding: 'utf8', stdio: 'pipe' },
      ).split('\n').filter((line) => line !== '');
    } catch (error) {
      if ((error as { status?: number }).status !== 1) throw error;
    }
    expect(referring).toEqual([]);
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

  it('has no command left that only pretends to run', () => {
    // `scripts/unimplemented.ts` existed so that a command the plan had named
    // but not yet built would fail loudly rather than report a green run for
    // work that never happened. `test:browser` was the last of them and U14
    // built it, so the placeholder is gone and this is what replaces the test
    // that used to drive it: every script runs something real.
    expect(existsSync(new URL('scripts/unimplemented.ts', `file://${root}`))).toBe(false);
    const pretending = Object.entries(pkg.scripts)
      .filter(([, command]) => command.includes('unimplemented'))
      .map(([name]) => name);
    expect(pretending).toEqual([]);
  });

  it('pins the two dependencies whose output must be reproducible', () => {
    // The obfuscator's transforms and the canvas rasterizer both change output
    // across minor versions; a caret range would silently move the artifact.
    expect(pkg.devDependencies['javascript-obfuscator']).toBe('5.7.0');
    expect(pkg.devDependencies['@napi-rs/canvas']).toBe('1.0.9');
  });
});
