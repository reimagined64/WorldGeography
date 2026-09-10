/**
 * What the pipeline fetches, and how it proves it got the same bytes twice.
 *
 * A version pin is not enough here. A git tag can be force-moved, a release
 * asset can be retagged, and the UN republishes WPP revisions *in place* — same
 * URL, same column layout, different numbers. So every download records its
 * resolved URL, sha256 and byte length in `data/raw/sources.lock.json`, and a
 * hash that no longer matches stops the run until a maintainer says
 * `--accept-source-change`. That is the difference between "the refresh found
 * new numbers" and "the refresh silently read a different dataset".
 *
 * Two of the four sources are not downloads at all: `world-countries` is a
 * pinned devDependency and CLDR arrives through the ICU built into Node. They
 * still belong in the lock, because a bumped package or a Node built against a
 * newer CLDR moves the Czech labels exactly as an upstream re-release would.
 *
 * This module also owns provenance, because provenance is a property of the
 * source list rather than of the merge: the notices have to name what the
 * fetchers actually read, and `data:check` fails if they still credit a source
 * no fetcher uses.
 */
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const RAW_DIR = join(REPO_ROOT, 'data/raw');
export const LOCK_PATH = join(RAW_DIR, 'sources.lock.json');
export const CACHE_DIR = join(REPO_ROOT, '.cache');

// ------------------------------------------------------------- the sources

/** One pinned download. `gzip` files are stored compressed and hashed compressed. */
export interface RemoteSource {
  readonly id: string;
  /** Human label, used in the report and in the generated provenance. */
  readonly what: string;
  readonly url: string;
  readonly gzip: boolean;
  /** Name under `.cache/`. Never committed; `.gitignore` excludes the directory. */
  readonly cacheFile: string;
}

/**
 * The two real downloads.
 *
 * Natural Earth is pinned to the `v5.1.2` tag rather than to `master` because
 * the basemap decides which polygons `territory.json` can name, and a moved tag
 * would change that under a rule set written against one release.
 */
export const REMOTE_SOURCES: Readonly<Record<string, RemoteSource>> = {
  'un-wpp': {
    id: 'un-wpp',
    what: 'UN World Population Prospects 2024 — Demographic Indicators, medium variant',
    url:
      'https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/' +
      'WPP2024_Demographic_Indicators_Medium.csv.gz',
    gzip: true,
    cacheFile: 'WPP2024_Demographic_Indicators_Medium.csv.gz',
  },
  'natural-earth': {
    id: 'natural-earth',
    what: 'Natural Earth 1:110m Admin 0 — Countries, v5.1.2',
    url:
      'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/' +
      'ne_110m_admin_0_countries.geojson',
    gzip: false,
    cacheFile: 'ne_110m_admin_0_countries.geojson',
  },
};

/** The two sources that arrive as software rather than as a download. */
export const LOCAL_SOURCES = {
  'world-countries': 'world-countries — ISO codes, English capitals, currencies, languages, seed positions',
  'icu-cldr': 'Unicode CLDR, through the ICU compiled into Node — Czech and English display names',
} as const;

// --------------------------------------------------------------- the lock

export interface RemotePin {
  /** The URL after redirects, which is what was actually read. */
  url: string;
  sha256: string;
  bytes: number;
  /** ISO date the pin was taken. The generated provenance quotes it. */
  accessed: string;
}

export interface LocalPin {
  version: string;
  accessed: string;
}

export interface SourceLock {
  why: string;
  remote: Record<string, RemotePin>;
  local: Record<string, LocalPin>;
}

export const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export function loadLock(path: string = LOCK_PATH): SourceLock {
  const root = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const { why, remote, local } = root;
  if (typeof why !== 'string' || why === '') throw new Error(`${path}: needs a \`why\``);
  if (typeof remote !== 'object' || remote === null) throw new Error(`${path}: \`remote\` must be an object`);
  if (typeof local !== 'object' || local === null) throw new Error(`${path}: \`local\` must be an object`);
  return { why, remote: remote as Record<string, RemotePin>, local: local as Record<string, LocalPin> };
}

/** Two-space JSON with a trailing newline, matching every other file under `data/`. */
export const serializeLock = (lock: SourceLock): string => `${JSON.stringify(lock, null, 2)}\n`;

/** `world-countries` from its own manifest; CLDR from the running Node. */
export function localVersion(id: string): string {
  if (id === 'world-countries') {
    const manifest = JSON.parse(
      readFileSync(join(REPO_ROOT, 'node_modules/world-countries/package.json'), 'utf8'),
    ) as { version?: string };
    if (typeof manifest.version !== 'string') throw new Error('world-countries has no version');
    return manifest.version;
  }
  if (id === 'icu-cldr') {
    return `icu ${process.versions.icu ?? '?'} / cldr ${process.versions.cldr ?? '?'} / node ${process.versions.node}`;
  }
  throw new Error(`unknown local source "${id}"`);
}

// ------------------------------------------------------------ downloading

/** What a fetch did relative to the lock. `changed` is the one that needs a decision. */
export type PinStatus = 'pinned' | 'cached' | 'new' | 'changed';

export interface FetchResult {
  source: RemoteSource;
  /** The bytes as stored — still gzipped for a `gzip` source, which is what is hashed. */
  bytes: Uint8Array;
  pin: RemotePin;
  status: PinStatus;
  /** Set when the lock held a different hash and `--accept-source-change` allowed it. */
  previous?: RemotePin;
}

/** Injectable so the suites can exercise the whole pipeline with no network. */
export type Transport = (url: string) => Promise<{ url: string; bytes: Uint8Array }>;

/**
 * Reads a URL into `.cache/`, hashing as the bytes land.
 *
 * Streamed rather than buffered because the WPP archive is 16 MB and the
 * gunzipped CSV another 84,000 rows on top of it; there is no reason for either
 * to sit in memory twice.
 */
export const httpTransport: Transport = async (url) => {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`GET ${url} → HTTP ${response.status} ${response.statusText}`);
  if (response.body === null) throw new Error(`GET ${url} → no body`);
  const chunks: Uint8Array[] = [];
  // `Readable.fromWeb` rather than iterating the web stream directly: the DOM
  // lib's `ReadableStream` carries no async iterator, and this project's
  // tsconfig includes it.
  for await (const chunk of Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])) {
    chunks.push(chunk as Uint8Array);
  }
  return { url: response.url === '' ? url : response.url, bytes: Buffer.concat(chunks) };
};

export interface FetchOptions {
  lock: SourceLock;
  /** A hash change is fatal without this. */
  acceptSourceChange?: boolean;
  /** Read `.cache/` instead of the network when the cached bytes match the pin. */
  cached?: boolean;
  cacheDir?: string;
  transport?: Transport;
  /** ISO date recorded on a new or changed pin. */
  today?: string;
}

export const isoToday = (): string => new Date().toISOString().slice(0, 10);

/**
 * Fetches one pinned source and reconciles it with the lock.
 *
 * The cache is deliberately not the default. `data:refresh` exists to find out
 * what upstream did, and a run that quietly re-reads yesterday's bytes answers
 * the wrong question; `--cached` is for iterating on the report itself.
 */
export async function fetchPinned(id: string, options: FetchOptions): Promise<FetchResult> {
  const source = REMOTE_SOURCES[id];
  if (source === undefined) throw new Error(`unknown remote source "${id}"`);
  const cacheDir = options.cacheDir ?? CACHE_DIR;
  const cachePath = join(cacheDir, source.cacheFile);
  const previous = options.lock.remote[id];

  let bytes: Uint8Array;
  let url = source.url;
  let fromCache = false;

  if (options.cached === true && existsSync(cachePath)) {
    bytes = readFileSync(cachePath);
    url = previous?.url ?? source.url;
    fromCache = true;
  } else {
    let got: { url: string; bytes: Uint8Array };
    try {
      got = await (options.transport ?? httpTransport)(source.url);
    } catch (cause) {
      // The maintainer needs to know which of the four sources died, and that
      // nothing was written — a half-refreshed `data/build/` is the failure
      // mode this whole command is built to avoid.
      throw new Error(
        `${source.what} is unreachable at ${source.url}: ${cause instanceof Error ? cause.message : String(cause)}. ` +
          `Nothing was fetched and nothing was written.`,
        { cause },
      );
    }
    bytes = got.bytes;
    url = got.url;
    mkdirSync(cacheDir, { recursive: true });
    await pipeline(Readable.from(Buffer.from(bytes)), createWriteStream(cachePath));
  }

  const digest = sha256(bytes);
  const pin: RemotePin = { url, sha256: digest, bytes: bytes.byteLength, accessed: options.today ?? isoToday() };

  if (previous === undefined) {
    return { source, bytes, pin, status: 'new' };
  }
  if (previous.sha256 === digest) {
    return { source, bytes, pin: { ...previous }, status: fromCache ? 'cached' : 'pinned' };
  }
  if (options.acceptSourceChange !== true) {
    throw new Error(
      `${source.what} changed upstream at the same URL.\n` +
        `  pinned : ${previous.sha256} (${previous.bytes} B, ${previous.accessed})\n` +
        `  fetched: ${digest} (${bytes.byteLength} B)\n` +
        `  ${url}\n` +
        `Re-run with --accept-source-change once you have decided the new bytes are the ones you want.`,
    );
  }
  return { source, bytes, pin, status: 'changed', previous };
}

// ------------------------------------------------------------- provenance

/** One entry of `data/build/sources.json`, as the atlas dialog reads it. */
export interface SourceEntry {
  name: string;
  url: string;
  use: string;
}

/**
 * Sources the notices credited before this pipeline existed.
 *
 * All five were real: `prepare_data.py` transcribed Worldometer's table, read
 * capitals out of `countryinfo`, resolved Czech labels through Babel, matched
 * codes with `pycountry` and lifted geometry from the Natural Earth fixture
 * that ships with `pyogrio`. None of them is read any more, and a notice that
 * credits a source nothing reads is not attribution, it is a false claim about
 * where the data came from — so naming one is a hard failure rather than a lint.
 */
export const RETIRED_SOURCES: readonly string[] = [
  'worldometer',
  'countryinfo',
  'babel',
  'pyogrio',
  'pycountry',
];

export interface RetiredMention {
  file: string;
  line: number;
  needle: string;
  text: string;
}

/** Every mention of a retired source, so the failure can name all of them at once. */
export function findRetiredSources(files: readonly { path: string; text: string }[]): RetiredMention[] {
  const found: RetiredMention[] = [];
  for (const file of files) {
    const lines = file.text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      const lowered = line.toLowerCase();
      for (const needle of RETIRED_SOURCES) {
        if (lowered.includes(needle)) found.push({ file: file.path, line: i + 1, needle, text: line.trim() });
      }
    }
  }
  return found;
}

/** `data/build/sources.json` entries this pipeline owns, keyed by the entry name. */
const GENERATED_ENTRY_NAMES: readonly string[] = [
  'OSN – World Population Prospects 2024 (CSV, střední varianta)',
  'Natural Earth – 1:110m Admin 0, v5.1.2',
  'world-countries – referenční databáze (ODC-ODbL 1.0)',
  'Unicode CLDR – prostřednictvím ICU v Node.js',
];

/** Entries the generated block replaces: the four above plus the retired ones. */
const REPLACED_ENTRY_PREFIXES: readonly string[] = [
  ...GENERATED_ENTRY_NAMES,
  'Worldometer',
  'CountryInfo',
  'Natural Earth – terms of use',
  'OSN – World Population Prospects 2024',
  'Unicode CLDR – Territory-Language Information',
  'Unicode CLDR – Supplemental Data',
];

const short = (digest: string): string => digest.slice(0, 12);

/** The four provenance entries, written from the lock rather than by hand. */
export function generatedSourceEntries(lock: SourceLock, year: number): SourceEntry[] {
  const wpp = lock.remote['un-wpp'];
  const ne = lock.remote['natural-earth'];
  const wc = lock.local['world-countries'];
  const icu = lock.local['icu-cldr'];
  if (wpp === undefined || ne === undefined || wc === undefined || icu === undefined) {
    throw new Error(`${LOCK_PATH}: the lock is missing one of un-wpp, natural-earth, world-countries, icu-cldr`);
  }
  return [
    {
      name: GENERATED_ENTRY_NAMES[0]!,
      url: wpp.url,
      use:
        `Přímý zdroj 195 populačních hodnot: sloupec TPopulation1July pro rok ${year}, ` +
        `uváděný v tisících a násobený tisícem. Soubor je připnutý otiskem sha256 ${short(wpp.sha256)}… ` +
        `(${wpp.bytes} B), staženo ${wpp.accessed}. Jde o projekce střední varianty WPP 2024, ` +
        `nikoli o dnešní sčítání.`,
    },
    {
      name: GENERATED_ENTRY_NAMES[1]!,
      url: ne.url,
      use:
        `Generalizovaný mapový podklad 1:110m, public domain. Připnuto na značku v5.1.2, ` +
        `otisk sha256 ${short(ne.sha256)}… (${ne.bytes} B), staženo ${ne.accessed}. ` +
        `Kód země se čte z pole ISO_A3; polygony, které upstream nechává nepřiřazené, ` +
        `rozhoduje data/overrides/territory.json. Podklad není zdrojem právního vymezení hranic.`,
    },
    {
      name: GENERATED_ENTRY_NAMES[2]!,
      url: 'https://github.com/mledoze/countries',
      use:
        `Balíček ${wc.version}: ISO kódy, anglické názvy hlavních měst, měny, jazyky, světadíl ` +
        `a orientační polohy. Data jsou pod ODC-ODbL 1.0, proto je data/build/countries.json ` +
        `odvozená databáze a šíří se pod toutéž licencí; plné znění je v licenses/ODbL-1.0.txt. ` +
        `Ověřeno ${wc.accessed}.`,
    },
    {
      name: GENERATED_ENTRY_NAMES[3]!,
      url: 'https://cldr.unicode.org/',
      use:
        `České a anglické názvy zemí, měn a jazyků přes Intl.DisplayNames: ${icu.version}. ` +
        `Verze ICU rozhoduje o znění popisků, proto je Node připnutý v .nvmrc. Ověřeno ${icu.accessed}.`,
    },
  ];
}

/**
 * Rewrites the four generated entries into `sources.json`, in place.
 *
 * The editorial entries around them — the EU Council euro decision, the
 * Equatorial Guinea decree, the Cairo and Nusantara pages — are primary-source
 * verifications a fetcher will never produce, so they are preserved in their
 * committed order. Only the pipeline's own block is regenerated, at the index
 * where the first replaced entry sat, which keeps the file stable across runs.
 */
export function regenerateSourcesJson(text: string, lock: SourceLock, year: number): string {
  const entries = JSON.parse(text) as SourceEntry[];
  const replaced = (entry: SourceEntry): boolean =>
    REPLACED_ENTRY_PREFIXES.some((prefix) => entry.name.startsWith(prefix));

  const at = entries.findIndex(replaced);
  const kept = entries.filter((entry) => !replaced(entry));
  const insert = at < 0 ? kept.length : entries.slice(0, at).filter((entry) => !replaced(entry)).length;
  kept.splice(insert, 0, ...generatedSourceEntries(lock, year));
  return `${JSON.stringify(kept, null, 2)}\n`;
}

/** The generated notice blocks, heading → body, in the order they appear. */
export function generatedNoticeBlocks(lock: SourceLock, year: number): Record<string, string> {
  const wpp = lock.remote['un-wpp'];
  const ne = lock.remote['natural-earth'];
  const wc = lock.local['world-countries'];
  const icu = lock.local['icu-cldr'];
  if (wpp === undefined || ne === undefined || wc === undefined || icu === undefined) {
    throw new Error(`${LOCK_PATH}: the lock is missing one of un-wpp, natural-earth, world-countries, icu-cldr`);
  }
  return {
    'NATURAL EARTH': [
      'Generalized 1:110m Admin 0 country geometry, public domain, release v5.1.2.',
      `Read from ${ne.url}`,
      `pinned by sha256 ${ne.sha256} (${ne.bytes} bytes), retrieved ${ne.accessed}.`,
      'Coordinates are rounded to three decimals and stored as plain arrays; no GIS',
      'library is embedded in the browser game.',
      'The basemap is illustrative, not an assertion of current legal boundaries.',
    ].join('\n'),
    'POPULATION FACTS': [
      'United Nations, Department of Economic and Social Affairs, Population Division.',
      `World Population Prospects 2024, medium variant. Game reference year: ${year}.`,
      `Read from ${wpp.url}`,
      `pinned by sha256 ${wpp.sha256} (${wpp.bytes} bytes), retrieved ${wpp.accessed}.`,
      'Column TPopulation1July is published in thousands and is multiplied by 1000 here.',
      'Selected population numbers are numerical facts, not reproduced article text,',
      'web design, charts, logos, or a live feed. Attribution does not imply endorsement.',
      'Do not treat these projections as current national census counts.',
    ].join('\n'),
    'COUNTRY REFERENCE FACTS': [
      `world-countries ${wc.version} supplies ISO 3166 codes, English capital names,`,
      'currencies, languages, continent and representative positions. Its data is licensed',
      'under the Open Database License (ODbL) v1.0 — see the ODbL notice below.',
      'Every value it supplies can be overridden by hand in data/overrides/, and many are;',
      'the overrides always win. See data/build/sources.json for the editorial corrections.',
    ].join('\n'),
    'OPEN DATABASE LICENSE (ODbL 1.0)': [
      'data/build/countries.json is a Derivative Database of world-countries',
      '(https://github.com/mledoze/countries), whose data is made available under the',
      'Open Data Commons Open Database License v1.0. It is therefore offered under the',
      'same licence: you are free to copy, distribute, adapt and build upon it, provided',
      'you attribute this project and world-countries, and share any adapted database',
      'under ODbL. Individual contents of the database are additionally available under',
      'the Database Contents License. The full licence text ships beside this file as',
      'licenses/ODbL-1.0.txt and is served next to the game.',
      'https://opendatacommons.org/licenses/odbl/1-0/',
      'This licence covers the country database only. The program itself is MIT.',
    ].join('\n'),
    'UNICODE CLDR REFERENCE DATA': [
      'Czech and English names of countries, currencies and languages come from Unicode',
      'CLDR through the ICU library compiled into Node.js, by way of Intl.DisplayNames:',
      `${icu.version}, verified ${icu.accessed}.`,
      'No CLDR or ICU executable code is embedded in the game.',
    ].join('\n'),
  };
}

/**
 * Replaces one heading-delimited block of a notices file.
 *
 * The notices are plain text a human reads, so the blocks carry no markers: a
 * block is an ALL-CAPS heading followed by contiguous non-blank lines, which is
 * how every provenance block in the file is already written. Anything else
 * would put generator syntax into a document whose whole job is to be read.
 */
export function replaceNoticeBlock(text: string, heading: string, newHeading: string, body: string): string {
  const marker = `\n${heading}\n`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`the notices have no "${heading}" block to regenerate`);
  const bodyStart = start + marker.length;
  const end = text.indexOf('\n\n', bodyStart);
  if (end < 0) throw new Error(`the "${heading}" block is not terminated by a blank line`);
  return `${text.slice(0, start)}\n${newHeading}\n${body}${text.slice(end)}`;
}

/** Removes everything from one heading up to (but not including) the next heading in `until`. */
export function removeNoticeRange(text: string, fromHeading: string, until: readonly string[]): string {
  const start = text.indexOf(`\n${fromHeading}\n`);
  if (start < 0) return text;
  for (const heading of until) {
    const end = text.indexOf(`\n${heading}\n`, start + 1);
    if (end >= 0) return text.slice(0, start) + text.slice(end);
  }
  throw new Error(`the notices have no block after "${fromHeading}" to stop at`);
}

/** Inserts a block after an existing one, unless it is already there. */
export function insertNoticeBlockAfter(text: string, after: string, heading: string, body: string): string {
  if (text.includes(`\n${heading}\n`)) return replaceNoticeBlock(text, heading, heading, body);
  const marker = `\n${after}\n`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`the notices have no "${after}" block to insert after`);
  const end = text.indexOf('\n\n', start + marker.length);
  if (end < 0) throw new Error(`the "${after}" block is not terminated by a blank line`);
  return `${text.slice(0, end)}\n\n${heading}\n${body}${text.slice(end)}`;
}

/** Rewrites every provenance block of a notices file from the lock. */
export function regenerateNotices(text: string, lock: SourceLock, year: number): string {
  const blocks = generatedNoticeBlocks(lock, year);
  const cldr = 'UNICODE CLDR REFERENCE DATA';
  const staleCldr = 'UNICODE CLDR / BABEL REFERENCE DATA';

  // The CountryInfo MIT notice goes with the package: it is the licence of a
  // dependency nothing imports any more, so leaving it would credit code the
  // game never runs.
  let out = removeNoticeRange(text, 'COUNTRYINFO NOTICE', [staleCldr, cldr]);
  out = replaceNoticeBlock(out, 'NATURAL EARTH', 'NATURAL EARTH', blocks['NATURAL EARTH']!);
  out = replaceNoticeBlock(out, 'POPULATION FACTS', 'POPULATION FACTS', blocks['POPULATION FACTS']!);
  out = replaceNoticeBlock(
    out,
    'COUNTRY REFERENCE FACTS',
    'COUNTRY REFERENCE FACTS',
    blocks['COUNTRY REFERENCE FACTS']!,
  );
  out = insertNoticeBlockAfter(
    out,
    'COUNTRY REFERENCE FACTS',
    'OPEN DATABASE LICENSE (ODbL 1.0)',
    blocks['OPEN DATABASE LICENSE (ODbL 1.0)']!,
  );
  return replaceNoticeBlock(out, out.includes(`\n${staleCldr}\n`) ? staleCldr : cldr, cldr, blocks[cldr]!);
}
