/**
 * Readable single-file build.
 *
 * Two stages: esbuild collapses the `src/main.ts` module graph into one IIFE,
 * then the same flat marker substitution v7 used drops that bundle, the CSS,
 * the licence notices and the four data blocks into `src/index.template.html`.
 * The result is one file with nothing left to fetch — which is the whole
 * product, not a packaging detail, so `assertSelfContained` runs on every
 * build rather than only in the suite.
 *
 * This is *not* the U2 concatenator. `scripts/legacy-concat-build.ts` is
 * frozen: it exists to reproduce the shipped v7 file byte for byte, and pays
 * for that with CPython number formatting that has no business in a build of
 * the live tree. The substitution helpers below are therefore lifted rather
 * than imported, and JSON is re-serialized with a plain `JSON.stringify`.
 *
 * U13 added the obfuscated flavor on top of `bundleScript`, which is why the
 * bundle is produced separately from the document it is inlined into:
 * `scripts/obfuscate.ts` bundles with `minify`, runs the obfuscator over the
 * result, and hands that to `assembleDocument`. Everything below this line is
 * shared by both flavors, including the offline guard — an obfuscated build
 * that reached for the network would be no less of an R8 failure.
 */
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type DataTag = 'COUNTRIES' | 'FLAGS' | 'MAP' | 'SOURCES';
export type MarkerTag = 'NOTICES' | 'CSS' | DataTag | 'BUNDLE';

/** `raw` is inlined verbatim; `json` is parsed and re-serialized compactly. */
export interface InlineSource {
  readonly kind: 'raw' | 'json';
  readonly text: string;
}

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Entry of the module graph, and the only entry: one bundle, one script tag. */
export const BUNDLE_ENTRY = 'src/main.ts';
export const TEMPLATE_FILE = 'src/index.template.html';

/**
 * Written outside `dist/` on purpose (KTD18): deploy publishes the obfuscated
 * artifact and only that one, and a readable copy sitting beside it would give
 * the obfuscation nothing left to protect.
 */
export const READABLE_OUTPUT = 'build/readable/index.html';

/**
 * The stylesheet, split by component and concatenated in this order.
 *
 * The order *is* the cascade, so it is a contract rather than a listing.
 * `tokens.css` is first because every other file reads the custom properties it
 * declares. `mobile.css` is last because it is the whole phone sheet kept
 * together — the `max-width` blocks at 700, 390 and 360 px, which are a layout
 * override that has to land on top of the component rules rather than be
 * scattered back among them. The file's own header says why the two narrower
 * blocks cannot be left behind.
 */
export const STYLE_FILES: readonly string[] = [
  'tokens', 'base', 'header', 'globe', 'panel', 'question', 'results', 'atlas', 'dialog', 'mobile',
].map((name) => `src/styles/${name}.css`);

/**
 * Marker tag to repo-relative path. Property order is the substitution order.
 * `BUNDLE` is absent because it is not read from disk, and `CSS` because it is
 * ten files rather than one — `readStylesheet` is where that lives.
 */
export const SOURCE_FILES: Readonly<Record<Exclude<MarkerTag, 'BUNDLE' | 'CSS'>, string>> = {
  NOTICES: 'data/embedded-notices.txt',
  COUNTRIES: 'data/build/countries.json',
  FLAGS: 'data/build/flags.json',
  MAP: 'data/build/map.json',
  SOURCES: 'data/build/sources.json',
};

/** The ten component sheets, concatenated in `STYLE_FILES` order. */
export function readStylesheet(root: string = REPO_ROOT): string {
  return STYLE_FILES.map((relative) => readFileSync(join(root, relative), 'utf8')).join('\n');
}

/** Everything a rebuild depends on, for `scripts/dev.ts` to watch. */
export const WATCH_PATHS: readonly string[] = ['src', 'data/build', SOURCE_FILES.NOTICES];

/** Raw text is inlined into these elements, so it may not contain their closers. */
const FORBIDDEN_CLOSERS = ['</script', '</style'] as const;

/**
 * A checkout with `core.autocrlf` on would otherwise make two builds of the
 * same tree differ, and the identical-bytes guarantee is what lets CI publish
 * the artifact it tested instead of rebuilding it.
 */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * Compact the JSON and hide `</` from the HTML parser.
 *
 * `<\/` is a legal JSON escape for `/`, so the value still parses. The
 * function form of `replaceAll` keeps a `$&` in the data from being expanded.
 */
export function inlineJson(text: string): string {
  return JSON.stringify(JSON.parse(normalizeNewlines(text))).replaceAll('</', () => '<\\/');
}

/** Non-JSON text goes in verbatim, so it must not close its host element. */
export function inlineRaw(tag: string, text: string): string {
  const normalized = normalizeNewlines(text);
  const lowered = normalized.toLowerCase();
  for (const closer of FORBIDDEN_CLOSERS) {
    const at = lowered.indexOf(closer);
    if (at !== -1) {
      throw new Error(
        `Source ${tag} contains ${closer} at offset ${at}, which would close the element it is inlined into`,
      );
    }
  }
  return normalized;
}

/**
 * Substitute every source into the template, in the order the keys were added.
 *
 * `replaceAll` with a replacer function twice deliberately: a marker may in
 * principle appear more than once, and the inlined content is arbitrary data
 * that may contain `$&` or `` $` ``, which the string form would read as a
 * substitution pattern.
 */
export function buildDocument(
  template: string,
  sources: Readonly<Record<string, InlineSource>>,
): string {
  let document = normalizeNewlines(template);
  for (const [tag, source] of Object.entries(sources)) {
    const replacement = source.kind === 'json' ? inlineJson(source.text) : inlineRaw(tag, source.text);
    document = document.replaceAll(`/*__${tag}__*/`, () => replacement);
  }

  const stray = document.indexOf('/*__');
  if (stray === -1) return document;
  const named = /^\/\*__([A-Za-z0-9_]*)__\*\//.exec(document.slice(stray));
  const name = named?.[1];
  throw new Error(
    name === undefined
      ? `Unreplaced template marker at offset ${stray}: ${JSON.stringify(document.slice(stray, stray + 48))}`
      : `Unreplaced template marker ${name}`,
  );
}

/**
 * References a browser would resolve on its own, as opposed to a URL the page
 * merely prints or opens on a click.
 *
 * The citation links in `sources.json` and the attribution URLs in the licence
 * notices are `https://` text and stay that way, so "contains no http" is the
 * wrong test — R8 is about what loads without the user asking. Anything that
 * fetches is either an element attribute, a CSS reference, or a network API.
 */
const EXTERNAL_REFERENCE_PATTERNS: readonly RegExp[] = [
  // Elements that exist only to pull in something else. `<script>` and `<img>`
  // are absent from this list because the document legitimately contains
  // both — the attribute rule below is what constrains them.
  /<(?:link|base|iframe|embed|object|frame)\b/gi,
  // A resource attribute may only hold a `data:` URI or a template expression
  // that produces one. A relative path is as fatal as an absolute URL: it is
  // the second file a single-file build is not allowed to have. Deliberately
  // strict enough to also catch `element.src = value` in script — a false
  // positive costs a rename and a loud message, a false negative ships R8.
  /\b(?:src|srcset|poster)\s*=\s*(?!["']?(?:data:|\$\{))/gi,
  /@import\b/gi,
  /\burl\(\s*["']?(?!data:|#)(?:[a-z][a-z0-9+.-]*:|\/\/)/gi,
  /\b(?:fetch|importScripts|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon)\s*\(/g,
];

/**
 * Fail the build, not the review, if anything in the output would go to the
 * network. R8 is the product's identity; nothing else in the pipeline notices
 * a stray `<script src>` sneaking in through a source file.
 */
export function assertSelfContained(html: string): void {
  const found: string[] = [];
  for (const pattern of EXTERNAL_REFERENCE_PATTERNS) {
    for (const match of html.matchAll(pattern)) found.push(match[0]);
  }
  if (found.length > 0) {
    throw new Error(
      `Built output is not self-contained; it would load ${found.length} external reference(s):\n  ${[...new Set(found)].join('\n  ')}`,
    );
  }
}

/**
 * Collapse the `src/main.ts` graph into one browser IIFE.
 *
 * `minify` is the obfuscated flavor's only request of this function. It runs
 * esbuild's minifier *before* the obfuscator rather than instead of it: every
 * transform the obfuscator applies multiplies what it is handed, so stripping
 * the comments and the long local names first is worth 55 KB of input and a
 * measured 139 KB of output. The readable flavor leaves it off, because being
 * readable is the entire purpose of that build.
 */
export async function bundleScript(root: string = REPO_ROOT, minify = false): Promise<string> {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [BUNDLE_ENTRY],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    // Non-ASCII stays non-ASCII: the UI is Czech, and `č` for every `č`
    // would cost ~30 KB and make the readable build unreadable.
    charset: 'utf8',
    minify,
    sourcemap: false,
    legalComments: 'inline',
    write: false,
    logLevel: 'silent',
  });

  const [output] = result.outputFiles;
  if (output === undefined) throw new Error('esbuild produced no output file');
  return output.text;
}

/**
 * Inline a finished bundle, the stylesheet and the four data blocks, then check.
 *
 * Takes the bundle rather than producing it, because U13 hands it a different
 * one: the obfuscated flavor is this same document around an obfuscated script,
 * and every other byte is identical. That sharing is not a convenience — KTD6
 * requires the 1.5 MB flag payload to stay out of the obfuscated JavaScript,
 * and it stays out precisely because it is substituted here, into its own inert
 * element, rather than imported by anything the bundler can see.
 */
export function assembleDocument(bundle: string, root: string = REPO_ROOT): string {
  const read = (relative: string) => readFileSync(join(root, relative), 'utf8');
  const sources: Record<string, InlineSource> = {};
  for (const [tag, relative] of Object.entries(SOURCE_FILES)) {
    sources[tag] = { kind: relative.endsWith('.json') ? 'json' : 'raw', text: read(relative) };
  }
  sources['CSS'] = { kind: 'raw', text: readStylesheet(root) };
  sources['BUNDLE'] = { kind: 'raw', text: bundle };

  const html = buildDocument(read(TEMPLATE_FILE), sources);
  assertSelfContained(html);
  return html;
}

/** Bundle, inline, and check. The returned string is the whole product. */
export async function buildReadable(root: string = REPO_ROOT): Promise<string> {
  return assembleDocument(await bundleScript(root), root);
}

/** Build and write, returning the byte length actually on disk. */
export async function writeReadable(root: string = REPO_ROOT, out?: string): Promise<number> {
  const target = out ?? join(root, READABLE_OUTPUT);
  const html = await buildReadable(root);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html, 'utf8');
  return Buffer.byteLength(html, 'utf8');
}

const USAGE = 'Usage: node scripts/build.ts [--root <dir>] [--out <file>]';

async function main(argv: readonly string[]): Promise<void> {
  let root = REPO_ROOT;
  let out: string | undefined;

  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined || (flag !== '--root' && flag !== '--out')) throw new Error(USAGE);
    if (flag === '--root') root = resolve(value);
    else out = resolve(value);
  }

  const target = out ?? join(root, READABLE_OUTPUT);
  const bytes = await writeReadable(root, target);
  console.log(`Built ${target} (${bytes.toLocaleString('en-US')} bytes)`);
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
