/**
 * The published build: one seeded, high-strength obfuscation pass, and the
 * directory that goes to Pages around it.
 *
 * `scripts/build.ts` produces the readable flavor and owns everything both
 * flavors share — the template substitution, the data blocks, the offline
 * guard. This file adds the one stage that separates them and the file copying
 * that only the published flavor needs.
 *
 * **The order is bundle, minify, obfuscate, inline, and nothing touches the
 * JavaScript afterwards.** `selfDefending` makes the output break rather than
 * degrade if it is reformatted, so a later pretty-printer, a trailing-newline
 * fixer or a Jekyll pass would not produce a slightly different game; it would
 * produce a blank page. That is also why `dist/.nojekyll` below is a
 * correctness requirement rather than hygiene.
 *
 * What the pass is for is stated in the plan and worth repeating here, because
 * it bounds the effort: the goal is that the shipped file be hard for a reading
 * agent to reconstruct into intelligible source. It is **not** a claim about
 * the curated data, which ships as plain JSON in the same file by design, is
 * the more valuable asset, and is protected by nothing at all.
 */
import obfuscator from 'javascript-obfuscator';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleDocument, bundleScript, REPO_ROOT } from './build.ts';

/** The options and their rationale, side by side. See the file's own `note`. */
export const OBFUSCATOR_CONFIG = 'obfuscator.json';

/** The published directory. Everything Pages serves is in here and nothing else. */
export const DIST_DIR = 'dist';
export const DIST_OUTPUT = 'dist/index.html';

/**
 * Files copied into `dist/` verbatim, source to destination.
 *
 * `LICENSE` and `THIRD_PARTY_NOTICES.txt` are R22. `404.html` is the only other
 * HTML the site publishes (R7). The pairing is explicit rather than a glob
 * because a published directory should list what it contains.
 */
export const DIST_FILES: Readonly<Record<string, string>> = {
  'LICENSE': 'LICENSE',
  'THIRD_PARTY_NOTICES.txt': 'THIRD_PARTY_NOTICES.txt',
  '404.html': '404.html',
};

/**
 * Copied whole, because the embedded notices name these paths.
 *
 * R26 is the reason this is not optional: the game prints "licenses/
 * Noto-Emoji-NOTICE.txt" and "licenses/Apache-2.0.txt" to the reader, relative
 * to the page. A site that does not serve them makes the attribution the game
 * prints false, which is a licence problem rather than a missing-file problem.
 */
export const DIST_LICENSES = 'licenses';

/**
 * Written empty, and load-bearing.
 *
 * GitHub Pages runs Jekyll over an artifact that does not have this file, and
 * Jekyll rewrites what it serves — it would also try to read `{{` and `{%` as
 * Liquid, and control-flow flattening emits `{{` by the thousand. Either way
 * the served bytes stop being the built bytes, and `selfDefending` turns that
 * from a subtle difference into a blank page.
 */
export const DIST_NOJEKYLL = '.nojekyll';

interface ObfuscatorFile {
  readonly options: Record<string, unknown>;
  readonly rationale: Record<string, string>;
}

/**
 * Read `obfuscator.json` and check that every option was explained.
 *
 * The check is here rather than only in the suite because the config is the
 * only record of *why* thirty options are set the way they are, and an option
 * added during a hurried debugging session is exactly the one a later reader
 * will not be able to account for.
 */
export function readObfuscatorConfig(root: string = REPO_ROOT): ObfuscatorFile {
  const file = join(root, OBFUSCATOR_CONFIG);
  const config = JSON.parse(readFileSync(file, 'utf8')) as ObfuscatorFile;
  const options = Object.keys(config.options).sort();
  const rationale = Object.keys(config.rationale).sort();

  const unexplained = options.filter((key) => !rationale.includes(key));
  const orphaned = rationale.filter((key) => !options.includes(key));
  if (unexplained.length > 0 || orphaned.length > 0) {
    throw new Error(
      `${OBFUSCATOR_CONFIG}: options and rationale disagree.`
      + (unexplained.length > 0 ? `\n  set but never explained: ${unexplained.join(', ')}` : '')
      + (orphaned.length > 0 ? `\n  explained but not set: ${orphaned.join(', ')}` : ''),
    );
  }
  if (config.options['seed'] === 0 || config.options['seed'] === undefined) {
    throw new Error(
      `${OBFUSCATOR_CONFIG}: seed must be pinned to a non-zero value, or no two builds match`,
    );
  }
  return config;
}

/** One pass, with the pinned options, over an already-minified bundle. */
export function obfuscateBundle(code: string, root: string = REPO_ROOT): string {
  const { options } = readObfuscatorConfig(root);
  return obfuscator.obfuscate(code, options as never).getObfuscatedCode();
}

/** Bundle, minify, obfuscate, inline. The returned string is the whole product. */
export async function buildObfuscated(root: string = REPO_ROOT): Promise<string> {
  const bundle = await bundleScript(root, true);
  return assembleDocument(obfuscateBundle(bundle, root), root);
}

/** What `writeDist` put where, for the caller to print or assert on. */
export interface DistReport {
  readonly dir: string;
  readonly bytes: number;
  readonly files: readonly string[];
}

/**
 * Build the published directory from scratch.
 *
 * `dist/` is removed first rather than written over. An artifact deploy
 * publishes exactly this directory, so a file left behind by an earlier build
 * — a renamed licence, a stale `index.html` from a flavor that no longer
 * exists — would go live on the strength of having once been correct.
 */
export async function writeDist(root: string = REPO_ROOT): Promise<DistReport> {
  const dir = join(root, DIST_DIR);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const html = await buildObfuscated(root);
  writeFileSync(join(dir, 'index.html'), html, 'utf8');

  for (const [to, from] of Object.entries(DIST_FILES)) {
    mkdirSync(dirname(join(dir, to)), { recursive: true });
    cpSync(join(root, from), join(dir, to));
  }
  cpSync(join(root, DIST_LICENSES), join(dir, DIST_LICENSES), { recursive: true });
  writeFileSync(join(dir, DIST_NOJEKYLL), '', 'utf8');

  const files = [
    'index.html',
    ...Object.keys(DIST_FILES),
    DIST_NOJEKYLL,
    ...readdirSync(join(dir, DIST_LICENSES)).map((name) => `${DIST_LICENSES}/${name}`),
  ].sort();

  return { dir, bytes: Buffer.byteLength(html, 'utf8'), files };
}

const USAGE = 'Usage: node scripts/obfuscate.ts [--root <dir>]';

async function main(argv: readonly string[]): Promise<void> {
  let root = REPO_ROOT;
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined || flag !== '--root') throw new Error(USAGE);
    root = resolve(value);
  }

  const report = await writeDist(root);
  console.log(`Built ${join(report.dir, 'index.html')} (${report.bytes.toLocaleString('en-US')} bytes)`);
  for (const file of report.files) console.log(`  ${file}`);
}

const invoked = process.argv[1];
if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
