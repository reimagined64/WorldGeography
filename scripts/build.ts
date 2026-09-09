/**
 * Single-file builder — a port of the archived `scripts/build.py`.
 *
 * The contract is one flat substitution pass: every `/*__TAG__*\/` marker in the
 * template is replaced by the contents of one file, JSON inputs re-serialized
 * compactly on the way in. Nothing is minified, compressed or fetched, so the
 * embedded licence notices stay plain text and the result opens from `file://`.
 *
 * The port is measured against the shipped v7 file byte for byte, which forces
 * it to reproduce CPython's formatting decisions rather than JavaScript's —
 * see `pythonFloatRepr`. Marker substitution and JSON inlining are kept free of
 * file I/O so U13 (obfuscated build) and U15 (readable build) can reuse them
 * over their own inputs.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type MarkerTag =
  | 'NOTICES' | 'CSS' | 'CORE' | 'CLOCK' | 'AUDIO' | 'GLOBE' | 'APP'
  | 'COUNTRIES' | 'FLAGS' | 'MAP' | 'SOURCES';

/** `raw` is concatenated verbatim; `json` is parsed and re-serialized compactly. */
export type InlineKind = 'raw' | 'json';

export interface InlineSource {
  readonly kind: InlineKind;
  readonly text: string;
}

/**
 * Marker tag to path, relative to a source root laid out the way v7 was.
 *
 * Property order is the substitution order, because an inlined text could in
 * principle contain a marker of its own; none does today, but build.py fixed
 * the order in a dict literal and the port keeps it observable.
 */
export const V7_SOURCE_FILES: Readonly<Record<MarkerTag, string>> = {
  NOTICES: 'embedded-notices.txt',
  CSS: 'style.css',
  CORE: 'js/core.js',
  CLOCK: 'js/clock.js',
  AUDIO: 'js/audio.js',
  GLOBE: 'js/globe.js',
  APP: 'js/app.js',
  COUNTRIES: 'data/countries.json',
  FLAGS: 'data/flags.json',
  MAP: 'data/map.json',
  SOURCES: 'data/sources.json',
};

export const V7_TEMPLATE_FILE = 'index.template.html';

/** Raw text is inlined into these elements, so it may not contain their closers. */
const FORBIDDEN_CLOSERS = ['</script', '</style'] as const;

/**
 * ES2025 JSON APIs that Node 24 has but the ES2022 lib target does not declare.
 * `context.source` is the only way to tell `20` from `20.0` after parsing, and
 * `rawJSON` the only way to put a chosen number token back verbatim.
 */
type ParseContext = { readonly source?: string };
const parseWithSource = JSON.parse as (
  text: string,
  reviver: (key: string, value: unknown, context?: ParseContext) => unknown,
) => unknown;
const rawJSON = (JSON as unknown as { rawJSON(text: string): unknown }).rawJSON;

/**
 * Python's `read_text` opens in universal-newline mode; `readFileSync` does not.
 * Every input is pure LF today, so this only matters under a Windows checkout
 * or `core.autocrlf` — where it would otherwise silently break the hash gate.
 */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * `repr()` of a float, as `json.dumps` emits it.
 *
 * Python and JavaScript agree on the shortest round-tripping digits and differ
 * only in how they lay them out: Python switches to exponent form outside
 * `-4 < decpt <= 16` (JavaScript: `-6 < decpt <= 21`), pads the exponent to two
 * digits, and always leaves a `.0` on an integral value. That last rule is not
 * hypothetical — the frozen `map.json` carries 135 coordinates like `180.0`.
 */
export function pythonFloatRepr(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`Cannot format non-finite number ${String(value)}`);
  if (value === 0) return Object.is(value, -0) ? '-0.0' : '0.0';

  const sign = value < 0 ? '-' : '';
  const shortest = String(Math.abs(value));
  const parts = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(shortest);
  if (parts === null) throw new Error(`Unrecognized number form ${shortest}`);

  // Reduce to (digits, decpt) with value === 0.<digits> * 10**decpt, which is
  // the representation both languages' formatters are defined over.
  const integer = parts[1] ?? '';
  const fraction = parts[2] ?? '';
  const exponent = parts[3] === undefined ? 0 : Number(parts[3]);
  let digits = integer + fraction;
  let decpt = integer.length + exponent;
  const leading = digits.length - digits.replace(/^0+/, '').length;
  digits = digits.slice(leading).replace(/0+$/, '');
  decpt -= leading;

  if (decpt <= -4 || decpt > 16) {
    const power = decpt - 1;
    const mantissa = digits.length > 1 ? `${digits.slice(0, 1)}.${digits.slice(1)}` : digits;
    const magnitude = String(Math.abs(power)).padStart(2, '0');
    return `${sign}${mantissa}e${power < 0 ? '-' : '+'}${magnitude}`;
  }
  if (decpt <= 0) return `${sign}0.${'0'.repeat(-decpt)}${digits}`;
  if (decpt >= digits.length) return `${sign}${digits}${'0'.repeat(decpt - digits.length)}.0`;
  return `${sign}${digits.slice(0, decpt)}.${digits.slice(decpt)}`;
}

/**
 * The token `json.dumps` would emit for a number token `json.loads` read.
 *
 * Python keeps integers exact at any width and floats in `repr` form, so the
 * decision hangs on the source token rather than on the parsed double.
 */
function pythonNumberToken(source: string): string {
  if (!/[.eE]/.test(source)) return BigInt(source).toString();
  if (!Number.isFinite(Number(source))) {
    throw new Error(
      `Cannot reproduce JSON number ${source}: Python emits a bare Infinity here, which is not valid JSON.`,
    );
  }
  return pythonFloatRepr(Number(source));
}

/** Parse, re-serialize compactly, then hide `</` from the HTML parser. */
export function inlineJson(text: string): string {
  const value = parseWithSource(normalizeNewlines(text), (_key, parsed, context) => {
    if (typeof parsed !== 'number') return parsed;
    if (typeof context?.source !== 'string') {
      // Without the source token an integral float is indistinguishable from an
      // integer, and the output would diverge from v7 without saying so.
      throw new Error('JSON.parse source access is unavailable; cannot reproduce Python number formatting');
    }
    return rawJSON(pythonNumberToken(context.source));
  });

  // `<\/` is a legal JSON escape for `/`, so the value still parses. The
  // function form of replaceAll keeps `$&` in the data from being expanded.
  return JSON.stringify(value).replaceAll('</', () => '<\\/');
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
 * `replaceAll` with a replacer function, twice deliberately: Python's
 * `str.replace` substitutes every occurrence where JS's string form takes only
 * the first, and the function form stops `$&` or `` $` `` in arbitrary inlined
 * data from being read as a substitution pattern.
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

/** Read a v7-shaped source tree and build it. */
export function buildFromDirectory(root: string): string {
  const read = (relative: string) => readFileSync(join(root, relative), 'utf8');
  const sources: Record<string, InlineSource> = {};
  for (const [tag, relative] of Object.entries(V7_SOURCE_FILES)) {
    sources[tag] = { kind: relative.endsWith('.json') ? 'json' : 'raw', text: read(relative) };
  }
  return buildDocument(read(V7_TEMPLATE_FILE), sources);
}

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const USAGE = 'Usage: node scripts/build.ts [--root <dir>] [--out <file>]';

function main(argv: readonly string[]): void {
  // The frozen fixtures are the only complete input set until U13/U15 emit the
  // compiled JS the live tree will hold, so they are the default source.
  let root = join(repoRoot, 'tests/fixtures/baseline');
  let out = join(repoRoot, 'build/v7-rebuild/index.html');

  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined || (flag !== '--root' && flag !== '--out')) throw new Error(USAGE);
    if (flag === '--root') root = resolve(value);
    else out = resolve(value);
  }

  const html = buildFromDirectory(root);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html, 'utf8');
  console.log(`Built ${out} (${Buffer.byteLength(html, 'utf8').toLocaleString('en-US')} bytes)`);
}

const invoked = process.argv[1];
if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
