/**
 * U13 — the published build, and the four things obfuscation must not cost.
 *
 * The pass itself is one library call, so almost nothing here is about whether
 * the obfuscator works. What is worth defending is the boundary around it:
 * the flag payload has to stay outside the obfuscated script (KTD6), the
 * licence notices have to stay readable (R21), the engine's code-keyed lookup
 * tables have to keep answering (the reason `transformObjectKeys` and
 * `renameProperties` are off), and two builds of one tree have to produce the
 * same bytes or the deploy cannot publish the artifact CI tested (KTD18).
 *
 * Every one of those is a property the config can silently lose. So the config
 * is asserted directly *and* the output is asserted against it — a test that
 * only read `obfuscator.json` back would pass on a file the obfuscator never
 * saw, and a test that only grepped the output would pass on a bundle that had
 * lost the transform that was hiding the identifier.
 *
 * `file://` playability, the network claim and the hot-path measurements live
 * in `tests/browser/obfuscated-build.spec.ts`; none of them can be answered
 * without a real browser.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import obfuscator from 'javascript-obfuscator';
import { assertSelfContained, READABLE_OUTPUT, REPO_ROOT, SOURCE_FILES, buildReadable } from '../../scripts/build.ts';
import {
  DIST_FILES,
  DIST_LICENSES,
  DIST_NOJEKYLL,
  DIST_OUTPUT,
  OBFUSCATOR_CONFIG,
  buildObfuscated,
  obfuscateBundle,
  readObfuscatorConfig,
} from '../../scripts/obfuscate.ts';
import { copySourceTree } from '../helpers/source-tree.ts';

/**
 * One build, shared. The pass takes about two seconds over a 140 KB bundle and
 * every assertion below reads the same output, so building per test would cost
 * half a minute to prove nothing extra.
 */
let built: Promise<string> | null = null;
const obfuscated = (): Promise<string> => (built ??= buildObfuscated());

const config = readObfuscatorConfig();

/** The one executable `<script>`; the other five are inert data blocks. */
const bundleOf = (html: string): string => {
  const match = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (match?.[1] === undefined) throw new Error('no executable script in the built document');
  return match[1];
};

const blockOf = (html: string, id: string): string => {
  const match = new RegExp(`<script id="${id}"[^>]*>([\\s\\S]*?)</script>`).exec(html);
  if (match?.[1] === undefined) throw new Error(`no ${id} block in the built document`);
  return match[1];
};

/**
 * The names the plan names, checked as identifiers rather than as substrings.
 *
 * The difference is the whole point of `transformObjectKeys: false`: the store
 * really does still carry a key spelled `lastGlobeCode` and the catalog a key
 * spelled `boot.noGlobe`, because object keys are deliberately left alone. What
 * must not survive is `Globe` as a name the reader can bind to a definition,
 * and `\b` is exactly that distinction — neither of those two spellings has a
 * word boundary before the capital G.
 *
 * `beginFlight` stands where the plan's scenario says `startFlight`: that was
 * v7's name for it and the port renamed it in U16. The control assertion below
 * is what caught the difference — it requires every name here to be present in
 * the readable bundle, so a list that had drifted out of the source would fail
 * rather than quietly assert that a name nothing uses cannot be found.
 */
const HIDDEN_IDENTIFIERS: readonly string[] = [
  'makeQuestion', 'candidateCountries', 'populationLabel', 'Globe', 'beginFlight', 'runScheduler',
];

describe('the obfuscator configuration', () => {
  it('explains every option it sets, and sets every option it explains', () => {
    // The config is the only record of why thirty options are what they are.
    expect(Object.keys(config.options).sort()).toEqual(Object.keys(config.rationale).sort());
    for (const [key, line] of Object.entries(config.rationale)) {
      expect({ key, explained: line.trim().length > 20 }).toEqual({ key, explained: true });
    }
  });

  it.each([
    ['an option nobody explained', (file: Record<string, Record<string, unknown>>) => {
      delete file['rationale']!['selfDefending'];
    }, /set but never explained: selfDefending/],
    ['a rationale for an option nobody set', (file: Record<string, Record<string, unknown>>) => {
      file['rationale']!['domainLock'] = 'locks the build to one host';
    }, /explained but not set: domainLock/],
    ['an unpinned seed', (file: Record<string, Record<string, unknown>>) => {
      file['options']!['seed'] = 0;
    }, /seed must be pinned/],
  ])('refuses %s', (_name, mutate, message) => {
    // Neither guard fires on the committed file, so the suite being green says
    // nothing about either. Both are given a config that should trip them.
    const tree = copySourceTree();
    try {
      const file = JSON.parse(readFileSync(join(tree.root, OBFUSCATOR_CONFIG), 'utf8')) as Record<string, Record<string, unknown>>;
      mutate(file);
      writeFileSync(join(tree.root, OBFUSCATOR_CONFIG), JSON.stringify(file), 'utf8');

      expect(() => readObfuscatorConfig(tree.root)).toThrow(message);
    } finally {
      tree.remove();
    }
  });

  it('runs the transforms the unit exists for', () => {
    // The plan names these seven. Reading them back is not a tautology: the
    // file is hand-edited, the obfuscator ignores an option it does not know,
    // and a `false` slipped into any one of them would cost a property that
    // the output assertions below cannot all see.
    expect({
      controlFlowFlattening: config.options['controlFlowFlattening'],
      deadCodeInjection: config.options['deadCodeInjection'],
      stringArray: config.options['stringArray'],
      stringArrayEncoding: config.options['stringArrayEncoding'],
      numbersToExpressions: config.options['numbersToExpressions'],
      splitStrings: config.options['splitStrings'],
      selfDefending: config.options['selfDefending'],
    }).toEqual({
      controlFlowFlattening: true,
      deadCodeInjection: true,
      stringArray: true,
      stringArrayEncoding: ['rc4'],
      numbersToExpressions: true,
      splitStrings: true,
      selfDefending: true,
    });
  });

  it('leaves off the three that would cost more than they buy', () => {
    expect({
      // Both would rewrite the reads the engine's lookup tables depend on.
      transformObjectKeys: config.options['transformObjectKeys'],
      renameProperties: config.options['renameProperties'],
      // Freezes the browser when DevTools opens, and defends against a reader
      // watching the code run rather than one reconstructing it.
      debugProtection: config.options['debugProtection'],
    }).toEqual({ transformObjectKeys: false, renameProperties: false, debugProtection: false });
  });
});

describe('the obfuscated bundle', () => {
  it('leaves no engine identifier to read', async () => {
    const bundle = bundleOf(await obfuscated());

    for (const name of HIDDEN_IDENTIFIERS) {
      expect({ name, readable: new RegExp(`\\b${name}\\b`).test(bundle) })
        .toEqual({ name, readable: false });
    }
    // …and the same names are all present in the flavor this one is built
    // from, so the assertion above is about the pass rather than about the
    // names having been renamed at some point in the last four units.
    const readable = bundleOf(await buildReadable());
    for (const name of HIDDEN_IDENTIFIERS) {
      expect({ name, readable: new RegExp(`\\b${name}\\b`).test(readable) })
        .toEqual({ name, readable: true });
    }
  });

  it('still answers a lookup keyed by country code', async () => {
    // The positive half of `transformObjectKeys: false`. Run rather than read:
    // the tables are built as object literals and read by a code computed at
    // runtime, which is the shape `renameProperties` silently breaks — it
    // leaves the table, renames its keys, and the read returns undefined.
    const table = `
      var CURRENCY_UNITS = { CZ: 'koruna', IL: 'šekel', ZW: 'ZiG' };
      var SPECIAL_CAPITALS = { ZA: 'Pretoria', PS: 'Ramalláh' };
      var byCode = { CZ: { capital: 'Praha' } };
      var code = ['C', 'Z'].join('');
      return CURRENCY_UNITS[code] + '/' + SPECIAL_CAPITALS.ZA + '/' + byCode[code].capital;
    `;
    const run = (options: Record<string, unknown>): unknown =>
      new Function(obfuscator.obfuscate(table, options as never).getObfuscatedCode())();

    expect(run(config.options)).toBe('koruna/Pretoria/Praha');
    // The guard bites: with property renaming on, the same table answers with
    // a TypeError instead. `transformObjectKeys` is a different case — it does
    // survive this shape, and is off on the plan's direction rather than on a
    // demonstrated break, which is what its rationale line says.
    expect(() => run({ ...config.options, renameProperties: true })).toThrow(TypeError);
  });

  it('keeps the 1.5 MB flag payload out of the bundle', async () => {
    // KTD6. With `splitStrings` at chunk length 5 this blob would become
    // roughly 380,000 fragments and RC4 would decode megabytes of it at boot;
    // measured, a bundle carrying it takes minutes to obfuscate rather than
    // two seconds. It is safe only because the bundler never sees it.
    const html = await obfuscated();
    const flags = blockOf(html, 'flag-data');
    const sample = flags.slice(Math.floor(flags.length / 2), Math.floor(flags.length / 2) + 64);

    expect(sample).toHaveLength(64);
    expect(flags).toContain(sample);
    expect(Buffer.byteLength(flags, 'utf8')).toBeGreaterThan(1_000_000);

    // The readable bundle is where the question can be answered, and asking it
    // there is not a weaker check: both flavors come out of the same
    // `bundleScript` call on the same entry point, so a payload absent from
    // that module graph is absent from both.
    //
    // Searching the obfuscated script instead would be the vacuous version of
    // this test — and it passes. `splitStrings` shatters every literal into
    // five-character fragments and RC4 encodes what survives, so a substring
    // search over that output answers "not found" for a payload sitting right
    // in the middle of it. This was measured, not assumed.
    const readable = bundleOf(await buildReadable());
    expect(readable).not.toContain(sample);
    // …and the search is capable of finding something, so "not found" means it.
    expect(readable).toContain('Zahájit expedici');
  });

  it('inlines every data block exactly as the readable build does', async () => {
    // The two flavors differ in one element and no other. Anything else that
    // moved would mean the obfuscated build is a second product rather than
    // the same one with its script rewritten.
    const [mine, readable] = await Promise.all([obfuscated(), buildReadable()]);

    for (const id of ['country-data', 'flag-data', 'map-data', 'source-data', 'license-data']) {
      expect({ id, same: blockOf(mine, id) === blockOf(readable, id) }).toEqual({ id, same: true });
    }
    expect(bundleOf(mine)).not.toBe(bundleOf(readable));
  });

  it('carries the licence notices as plain readable text', async () => {
    // R21. The notices are a legal obligation printed to the player, so they
    // are the one block that must read as prose in the shipped file.
    const html = await obfuscated();
    const notices = readFileSync(join(REPO_ROOT, SOURCE_FILES.NOTICES), 'utf8');

    expect(blockOf(html, 'license-data')).toBe(notices);
    expect(html).toContain('MIT License');
    expect(html).toContain('OPEN DATABASE LICENSE (ODbL 1.0)');
  });

  it('names the licence paths the published directory serves', async () => {
    // R26. The notices tell the reader where the full texts are; `dist/` has
    // to answer at exactly those paths or the attribution the game prints is
    // a false statement. Read the claim out of the notices rather than
    // restating it, so a renamed licence file fails here.
    const notices = readFileSync(join(REPO_ROOT, SOURCE_FILES.NOTICES), 'utf8');
    const named = [...notices.matchAll(/\blicenses\/([\w.-]+\.txt)\b/g)].map((match) => match[1]!);

    expect(new Set(named)).toEqual(new Set(readdirSync(join(REPO_ROOT, DIST_LICENSES))));
    // …and no reader is sent to a ZIP package that a Pages URL does not have.
    expect(notices).not.toMatch(/ZIP/i);
  });

  it('produces identical bytes from an unchanged tree', async () => {
    // The obfuscator randomizes by default. Without the pinned seed the deploy
    // could not publish the artifact CI tested (KTD18) and every release would
    // be a full cache miss for every returning player.
    const [first, second] = await Promise.all([buildObfuscated(), buildObfuscated()]);
    expect(Buffer.from(first, 'utf8').equals(Buffer.from(second, 'utf8'))).toBe(true);

    // And the seed is what buys it, rather than the input happening to be
    // stable: the same bundle under a different seed is a different file.
    const bundle = 'const greet = (who) => `ahoj ${who}`; globalThis.g = greet("svete");';
    expect(obfuscateBundle(bundle)).not.toBe(
      obfuscator.obfuscate(bundle, { ...config.options, seed: 1986 } as never).getObfuscatedCode(),
    );
  });

  it('is still one self-contained file', async () => {
    // R8 does not relax for the published flavor, and the obfuscator emits
    // code shapes the readable build never contains.
    const html = await obfuscated();

    expect(() => assertSelfContained(html)).not.toThrow();
    expect([...html.matchAll(/<script(?![^>]*\btype=)[^>]*>/gi)]).toHaveLength(1);
    expect(html.startsWith('<!doctype html>')).toBe(true);
  });
});

describe('the published directory', () => {
  it('assembles everything Pages serves, and nothing else', async () => {
    const tree = copySourceTree();
    try {
      execFileSync('node', [join(REPO_ROOT, 'scripts/obfuscate.ts'), '--root', tree.root], {
        cwd: REPO_ROOT,
        stdio: 'pipe',
      });

      const dist = join(tree.root, 'dist');
      const listed = readdirSync(dist, { recursive: true, encoding: 'utf8' }).sort();
      expect(listed).toEqual([
        '.nojekyll', '404.html', 'LICENSE', 'THIRD_PARTY_NOTICES.txt', 'index.html',
        'licenses', 'licenses/Apache-2.0.txt', 'licenses/Noto-Emoji-NOTICE.txt', 'licenses/ODbL-1.0.txt',
      ]);

      // `.nojekyll` is not decoration: Jekyll rewrites what it serves, and
      // `selfDefending` turns a rewritten bundle into a blank page rather than
      // a slightly different one.
      expect(readFileSync(join(dist, DIST_NOJEKYLL), 'utf8')).toBe('');
      for (const [to, from] of Object.entries(DIST_FILES)) {
        expect({ to, same: readFileSync(join(dist, to), 'utf8') === readFileSync(join(REPO_ROOT, from), 'utf8') })
          .toEqual({ to, same: true });
      }
    } finally {
      tree.remove();
    }
  });

  it('never publishes the readable build beside it', async () => {
    // KTD18. A readable copy served from the same site would leave the
    // obfuscated one guarding nothing at all.
    const tree = copySourceTree();
    try {
      execFileSync('node', [join(REPO_ROOT, 'scripts/obfuscate.ts'), '--root', tree.root], {
        cwd: REPO_ROOT,
        stdio: 'pipe',
      });

      expect(existsSync(join(tree.root, READABLE_OUTPUT))).toBe(false);
      expect(DIST_OUTPUT.startsWith('dist/')).toBe(true);
      expect(READABLE_OUTPUT.startsWith('dist/')).toBe(false);

      // The published index is the obfuscated flavor, not a copy of the other
      // one that happens to sit at the right path.
      const published = readFileSync(join(tree.root, DIST_OUTPUT), 'utf8');
      for (const name of HIDDEN_IDENTIFIERS) {
        expect({ name, readable: new RegExp(`\\b${name}\\b`).test(published) })
          .toEqual({ name, readable: false });
      }
    } finally {
      tree.remove();
    }
  });

  it('rebuilds the directory rather than writing over it', async () => {
    // An artifact deploy publishes exactly this directory. A file left behind
    // by an earlier build would go live on the strength of having once been
    // correct — a renamed licence is the case that matters, because the game
    // would still be naming the old path.
    const tree = copySourceTree();
    try {
      const dist = join(tree.root, 'dist');
      const run = () => execFileSync('node', [join(REPO_ROOT, 'scripts/obfuscate.ts'), '--root', tree.root], {
        cwd: REPO_ROOT,
        stdio: 'pipe',
      });

      run();
      writeFileSync(join(dist, 'licenses', 'Retired-1.0.txt'), 'a licence nobody credits any more', 'utf8');
      run();

      expect(existsSync(join(dist, 'licenses', 'Retired-1.0.txt'))).toBe(false);
      expect(existsSync(join(dist, 'index.html'))).toBe(true);
    } finally {
      tree.remove();
    }
  });
});
