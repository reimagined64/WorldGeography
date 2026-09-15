/**
 * `npm run data:refresh` — fetch upstream, merge, report, and write nothing.
 *
 * Writing is the exception here, not the default. The command fetches the four
 * sources, applies the override layer, diffs the result against the committed
 * baseline and prints what a maintainer would need to know before agreeing to
 * it. Only `--accept` writes, only on a clean `data/`, and only as one atomic
 * set.
 *
 * **There is no change budget.** The plan sized one — fail without
 * `--accept-large` when a curated field moves at all, or when more than N
 * countries change — for unattended automation. This refresh is manual and
 * roughly yearly, run by the maintainer who then reads the diff, so a threshold
 * gate would be tuned against zero real refreshes and bypassed reflexively on
 * the first one. What survives is the two parts a human reading a diff cannot
 * do for themselves: the absolute invariants in `data:check`, which do not care
 * how much changed, and the shadowed-changes section, which reports what did
 * *not* change because an override suppressed it. A per-country population
 * moving more than 25 % stays fatal, because that is a broken join rather than
 * a large change.
 *
 * The first run of this command is a source substitution rather than an update:
 * v7's populations were transcribed from Worldometer and its geometry lifted
 * from a pyogrio test fixture. `--accept` against the real `data/build/` is a
 * separate reviewed decision, because it moves the dataset the golden fixtures
 * were captured from.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Country, Locale } from '../../src/engine/types.ts';
import {
  BASE_LOCALE,
  buildDataset,
  loadCountrySnapshot,
  paths,
  serializeCountries,
  serializeCountrySnapshot,
  serializeMap,
  serializeMapSnapshot,
  writeAtomically,
  type CountrySnapshot,
  type MapSnapshot,
  type PendingWrite,
} from './apply.ts';
import { datasetChecks, renderChecks, type CheckResult } from './check.ts';
import {
  diffCountries,
  diffPolygons,
  populationAlarms,
  renderCountryDiff,
  renderPolygons,
  renderPopulation,
  renderShadowed,
  type DatasetDiff,
} from './diff.ts';
import {
  loadLocaleBundle,
  loadOverrides,
  type FetchedCountry,
  type MapPolygon,
  type OverrideBundle,
} from './merge.ts';
import { fetchGeometry } from './fetchers/geometry.ts';
import { fetchPopulation, type PopulationRow } from './fetchers/population.ts';
import { readReference, type ReferenceCountry } from './fetchers/reference.ts';
import { displayNames } from './fetchers/names.ts';
import {
  isoToday,
  loadLock,
  localVersion,
  regenerateEditionDate,
  regenerateNotices,
  regenerateSourcesJson,
  serializeLock,
  type FetchResult,
  type SourceLock,
  type Transport,
} from './sources.ts';

/** The WPP reference year the game asks about. */
export const DEFAULT_YEAR = 2026;

/** Locales the snapshot carries display names for. U12 turns the second one on. */
export const SNAPSHOT_LOCALES: readonly Locale[] = ['cs', 'en'];

// -------------------------------------------------------------- assembly

export interface AssembleInput {
  reference: readonly ReferenceCountry[];
  population: readonly PopulationRow[];
  year: number;
  locales?: readonly Locale[];
  /**
   * Read only to widen the display-name tables, never to change what is fetched.
   * See `resolvedCodes`.
   */
  overrides?: OverrideBundle;
}

/**
 * Every currency or language code the merge might end up selecting for a country.
 *
 * The merge looks a display name up in the *fetched* table, so a code that
 * reaches the dataset through an override has no name there and falls back to
 * the bare code: pinning Bulgaria's currency to `EUR` would print "EUR" where
 * the baseline prints "euro", because `world-countries` still lists `BGN` and
 * nothing ever asked CLDR what `EUR` is called. Resolving names for the union
 * costs four Intl lookups and removes a whole class of false diffs. It does not
 * give the overrides any say over *which* codes are chosen — that is still the
 * merge's decision, made from the fetched list.
 */
type CodeLayer = {
  overrides: Readonly<Record<string, readonly string[]>>;
  missingUpstream: Readonly<Record<string, readonly string[]>>;
};

const resolvedCodes = (
  fetched: readonly string[],
  code: string,
  layer: CodeLayer | undefined,
): string[] => [
  ...new Set([...fetched, ...(layer?.overrides[code] ?? []), ...(layer?.missingUpstream[code] ?? [])]),
];

/**
 * Joins the four sources into the shape `mergeCountries` reads.
 *
 * The join key between the reference set and the population table is ISO 3166-1
 * alpha-3, and a country with no population row is fatal rather than skipped: a
 * silently dropped country is a country the deck stops asking about, which is
 * the kind of loss nobody notices until a player does.
 *
 * `excludeLanguages` is the fetch's own language list and nothing wider.
 * `prepare_data.py` had CLDR's territory-language table through Babel, which
 * listed every language spoken in a territory above a threshold; neither
 * `world-countries` nor `Intl` exposes that, so the distractor filter excludes
 * what upstream knows about and the override layer widens it where it matters.
 */
export function assembleFetch(input: AssembleInput): FetchedCountry[] {
  const byIso3 = new Map(input.population.map((row) => [row.iso3, row]));
  const locales = input.locales ?? SNAPSHOT_LOCALES;
  const namers = locales.map((locale) => displayNames(locale));

  return input.reference.map((country): FetchedCountry => {
    const row = byIso3.get(country.iso3);
    if (row === undefined) {
      throw new Error(
        `${country.code}/${country.iso3} has no row in the WPP table for ${input.year}. ` +
          `A country the game asks about cannot silently lose its population.`,
      );
    }
    const currencyCodes = resolvedCodes(country.currency, country.code, input.overrides?.currencies);
    const languageCodes = resolvedCodes(country.languages, country.code, input.overrides?.languages);
    const text: Record<string, NonNullable<FetchedCountry['text'][Locale]>> = {};
    for (const namer of namers) {
      text[namer.locale] = {
        name: namer.region(country.code),
        capital: country.capital,
        currencyNames: Object.fromEntries(currencyCodes.map((unit) => [unit, namer.currency(unit)])),
        languageNames: Object.fromEntries(languageCodes.map((tag) => [tag, namer.language(tag)])),
      };
    }
    return {
      code: country.code,
      iso3: country.iso3,
      currency: country.currency,
      languages: country.languages,
      excludeLanguages: country.languages,
      lat: country.lat,
      lon: country.lon,
      region: country.region,
      population: row.population,
      populationYear: row.year,
      populationKind: 'projekce',
      populationSource: `un-wpp-2024-${row.year}`,
      text,
    };
  });
}

// ------------------------------------------------------------ the command

export interface RefreshOptions {
  root?: string;
  year?: number;
  accept?: boolean;
  acceptSourceChange?: boolean;
  /** Read `.cache/` rather than the network. For iterating on the report. */
  cached?: boolean;
  full?: boolean;
  transport?: Transport;
  /** Injectable so the dirty-tree guard is testable without touching a repository. */
  gitStatus?: (root: string) => string;
  today?: string;
}

export interface RefreshResult {
  report: string[];
  diff: DatasetDiff;
  checks: CheckResult[];
  snapshot: CountrySnapshot;
  map: MapSnapshot;
  countries: Country[];
  polygons: MapPolygon[];
  writes: PendingWrite[];
  accepted: boolean;
}

/** `git status --porcelain` over `data/`. Empty means clean; a throw means not a repository. */
export function gitStatusOfData(root: string): string {
  // stderr is captured rather than inherited: a fixture tree is not a
  // checkout, and `fatal: not a git repository` on the console would read as a
  // failure when it is the expected answer.
  return execFileSync('git', ['status', '--porcelain', '--', 'data'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export async function refresh(options: RefreshOptions = {}): Promise<RefreshResult> {
  const at = paths(options.root);
  const year = options.year ?? DEFAULT_YEAR;
  const today = options.today ?? isoToday();
  const overrides = loadOverrides(at.overrides);
  const bundle = loadLocaleBundle(BASE_LOCALE, at.overrides);
  const lock = loadLock(at.lock);

  const fetchOptions = {
    lock,
    acceptSourceChange: options.acceptSourceChange === true,
    cached: options.cached === true,
    cacheDir: join(at.root, '.cache'),
    today,
    ...(options.transport === undefined ? {} : { transport: options.transport }),
  };

  const population = await fetchPopulation(year, fetchOptions);
  const geometry = await fetchGeometry(overrides.territory, fetchOptions);
  const reference = readReference();

  const fetched = assembleFetch({ reference, population: population.rows, year, overrides });
  const snapshot: CountrySnapshot = {
    why:
      'One accepted fetch, normalized and reduced, before any override. `npm run data:apply` re-merges ' +
      'this with data/overrides/ offline, which is how an editorial edit reaches data/build/ without a ' +
      'network round trip. Machine-written by `npm run data:refresh -- --accept`; do not hand-edit.',
    fetchedAt: today,
    year,
    countries: fetched,
  };
  const map: MapSnapshot = {
    why:
      'The Natural Earth basemap as upstream codes it, before data/overrides/territory.json runs. ' +
      'Kept pre-territory so a territorial call can be re-decided offline. Machine-written.',
    fetchedAt: today,
    polygons: geometry.raw,
  };

  const built = buildDataset({ snapshot, map, overrides, bundle });
  const countriesText = serializeCountries(built.countries);
  const mapText = serializeMap(built.polygons);

  const baselineCountriesText = readFileSync(at.countries, 'utf8');
  const baselineMapText = readFileSync(at.map, 'utf8');
  const diff = diffCountries(JSON.parse(baselineCountriesText) as Country[], built.countries);
  diff.polygons = diffPolygons(JSON.parse(baselineMapText) as MapPolygon[], built.polygons);

  const checks = datasetChecks({
    countries: built.countries,
    polygons: built.polygons,
    countriesText,
    mapText,
    overrides,
    flags: JSON.parse(readFileSync(at.flags, 'utf8')) as Record<string, string>,
    hasFlagFile: (code) => existsSync(join(at.root, 'assets/flags', `${code}.png`)),
  });

  // --- the report ------------------------------------------------------
  const pins: FetchResult[] = [population.pin, geometry.pin];
  const report: string[] = [
    `data:refresh — candidate for reference year ${year}`,
    `baseline: ${describeBaseline(at.root)}`,
    '',
    'sources',
  ];
  for (const pin of pins) {
    report.push(
      `  ${pin.source.id} [${pin.status}] ${pin.pin.bytes} B  sha256 ${pin.pin.sha256}`,
      `    ${pin.pin.url}`,
    );
    if (pin.previous !== undefined) report.push(`    was ${pin.previous.sha256} (${pin.previous.accessed})`);
  }
  for (const [id, pin] of Object.entries(lock.local)) {
    const now = localVersion(id);
    report.push(`  ${id} [${now === pin.version ? 'pinned' : 'CHANGED'}] ${now}`);
    if (now !== pin.version) report.push(`    was ${pin.version}`);
  }

  report.push(
    '',
    ...renderCountryDiff({ diff, shadowed: built.shadowed, ...(options.full === true ? { full: true } : {}) }),
    '',
    ...renderPopulation(diff),
    '',
    ...renderPolygons(diff),
    '',
    ...renderShadowed(built.shadowed, options.full === true),
    '',
    'invariants',
    ...renderChecks(checks),
  );

  // --- the two hard gates ----------------------------------------------
  const alarms = populationAlarms(diff.population);
  const failedChecks = checks.filter((check) => !check.ok);
  const localDrift = Object.entries(lock.local).filter(([id, pin]) => localVersion(id) !== pin.version);
  const blockers: string[] = [
    ...alarms.map(
      (alarm) => `${alarm.code} ${alarm.name} population moved ${(alarm.ratio * 100).toFixed(1)} %`,
    ),
    ...failedChecks.map((check) => `invariant "${check.name}": ${check.detail}`),
    ...(options.acceptSourceChange === true
      ? []
      : localDrift.map(([id, pin]) => `${id} is ${localVersion(id)} but the lock pins ${pin.version}`)),
  ];

  const writes = plannedWrites(at, {
    fetchedAt: today,
    snapshot,
    map,
    lock: nextLock(lock, pins, today),
    countriesText,
    mapText,
    year,
  });
  const done = (accepted: boolean): RefreshResult => ({
    report,
    diff,
    checks,
    snapshot,
    map,
    countries: built.countries,
    polygons: built.polygons,
    writes,
    accepted,
  });

  if (blockers.length > 0) {
    report.push('', 'BLOCKED — nothing written:', ...blockers.map((line) => `  ${line}`));
    if (options.accept === true) {
      throw new Error(`data:refresh refused to write:\n  ${blockers.join('\n  ')}`);
    }
    return done(false);
  }

  if (options.accept !== true) {
    report.push(
      '',
      'Report only — data/build/ was not modified. Re-run with --accept to write.',
    );
    return done(false);
  }

  // --- accept ------------------------------------------------------------
  const status = (options.gitStatus ?? tryGitStatus)(at.root);
  if (status.trim() !== '') {
    throw new Error(
      `--accept refuses to run: data/ has uncommitted changes.\n${status.trimEnd()}\n` +
        `Commit or stash them first — an accepted refresh has to be reviewable as one diff, ` +
        `and a half-edited data/ would be indistinguishable from what the refresh wrote.`,
    );
  }
  writeAtomically(writes);
  report.push('', `Accepted. ${writes.length} files written atomically.`);
  return done(true);
}

/** Returns an empty status where `root` is not a git checkout, so a fixture tree can accept. */
function tryGitStatus(root: string): string {
  try {
    return gitStatusOfData(root);
  } catch {
    return '';
  }
}

const describeBaseline = (root: string): string => {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return `data/build/ at ${sha}`;
  } catch {
    return 'data/build/ (not a git checkout — no commit to name)';
  }
};

/** The lock as it would be after this run: every pin refreshed, nothing dropped. */
export function nextLock(lock: SourceLock, pins: readonly FetchResult[], today: string): SourceLock {
  const remote = { ...lock.remote };
  for (const pin of pins) remote[pin.source.id] = pin.pin;
  const local = { ...lock.local };
  for (const id of Object.keys(local)) local[id] = { version: localVersion(id), accessed: today };
  return { why: lock.why, remote, local };
}

interface PlannedInput {
  /** The date the snapshot records, which the dialog has to agree with. */
  fetchedAt: string;
  snapshot: CountrySnapshot;
  map: MapSnapshot;
  lock: SourceLock;
  countriesText: string;
  mapText: string;
  year: number;
}

/**
 * Every file an accept touches, as one set.
 *
 * The snapshots and the lock are in the set for the same reason the dataset is:
 * `data/raw/` that no longer matches `data/build/` breaks `data:apply`, and a
 * lock that names bytes the snapshot was not built from is worse than no lock.
 */
function plannedWrites(at: ReturnType<typeof paths>, input: PlannedInput): PendingWrite[] {
  const lock = input.lock;
  return [
    { path: at.rawCountries, text: serializeCountrySnapshot(input.snapshot) },
    { path: at.rawMap, text: serializeMapSnapshot(input.map) },
    { path: at.lock, text: serializeLock(lock) },
    { path: at.countries, text: input.countriesText },
    { path: at.map, text: input.mapText },
    { path: at.sources, text: regenerateSourcesJson(readFileSync(at.sources, 'utf8'), lock, input.year) },
    { path: at.notices, text: regenerateNotices(readFileSync(at.notices, 'utf8'), lock, input.year) },
    { path: at.thirdParty, text: regenerateNotices(readFileSync(at.thirdParty, 'utf8'), lock, input.year) },
    { path: at.dialog, text: regenerateEditionDate(readFileSync(at.dialog, 'utf8'), input.fetchedAt) },
  ];
}

// ---------------------------------------------------------------- the CLI

const invoked = process.argv[1];
if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flag = (name: string): boolean => argv.includes(`--${name}`);
  const value = (name: string): string | undefined => {
    const at = argv.indexOf(`--${name}`);
    return at < 0 ? undefined : argv[at + 1];
  };
  const root = value('root');
  const year = value('year');
  refresh({
    ...(root === undefined ? {} : { root }),
    ...(year === undefined ? {} : { year: Number(year) }),
    accept: flag('accept'),
    acceptSourceChange: flag('accept-source-change'),
    cached: flag('cached'),
    full: flag('full'),
  })
    .then((result) => {
      console.log(result.report.join('\n'));
      // A blocked report is not a crash, but it is not a success either: CI and
      // a maintainer both need the exit code to say so.
      if (result.report.some((line) => line.startsWith('BLOCKED'))) process.exit(1);
    })
    .catch((error: unknown) => {
      console.error(
        `data:refresh failed — nothing was written.\n${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    });
}

/** Re-exported so `data:apply` and the suites can read a snapshot without importing two modules. */
export { loadCountrySnapshot };
