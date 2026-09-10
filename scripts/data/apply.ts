/**
 * `npm run data:apply` — re-merge the committed snapshots offline.
 *
 * This is the command the project's "edit one JSON file" promise actually runs.
 * A maintainer changes a capital, a language list or a territorial call in
 * `data/overrides/`, runs this, and `data/build/` is rebuilt from the snapshots
 * in `data/raw/` with **no network, no fetch and no change budget**. Requiring a
 * refresh for an editorial edit would mean every override change also imported
 * whatever upstream did that week, which is the opposite of what the layer is
 * for.
 *
 * `data/raw/` therefore has to be a faithful record of the last accepted fetch,
 * and the invariant that makes that checkable is that re-merging it reproduces
 * `data/build/` byte for byte on a clean tree. `data:check` asserts exactly
 * that, so a snapshot drifting out of step with the built dataset fails in CI
 * rather than the next time someone edits a capital.
 *
 * This module also owns the writer, because `data:refresh --accept` writes the
 * same files and a partial write is the one failure that poisons the next
 * diff's baseline: the outputs would disagree with each other and the
 * disagreement would be read as the new truth.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pythonFloatRepr } from '../legacy-concat-build.ts';
import {
  applyTerritory,
  loadLocaleBundle,
  loadOverrides,
  mergeCountries,
  projectLocale,
  type FetchedCountry,
  type MapPolygon,
  type OverrideBundle,
  type ShadowedChange,
} from './merge.ts';
import { diffCountries, diffPolygons, renderCountryDiff, renderPolygons, renderShadowed } from './diff.ts';
import { REPO_ROOT } from './sources.ts';
import type { Country, LocaleBundle } from '../../src/engine/types.ts';

/** The locale `data/build/countries.json` is projected to. U12 widens this. */
export const BASE_LOCALE = 'cs' as const;

export const paths = (root: string = REPO_ROOT) => ({
  root,
  overrides: join(root, 'data/overrides'),
  rawCountries: join(root, 'data/raw/countries.json'),
  rawMap: join(root, 'data/raw/map.json'),
  lock: join(root, 'data/raw/sources.lock.json'),
  countries: join(root, 'data/build/countries.json'),
  map: join(root, 'data/build/map.json'),
  sources: join(root, 'data/build/sources.json'),
  notices: join(root, 'data/embedded-notices.txt'),
  flags: join(root, 'data/build/flags.json'),
});

// -------------------------------------------------------------- snapshots

/** `data/raw/countries.json` — one fetch, normalized, before any override. */
export interface CountrySnapshot {
  why: string;
  /** The date the fetch that produced this ran. */
  fetchedAt: string;
  /** The WPP reference year the populations are for. */
  year: number;
  countries: FetchedCountry[];
}

/** `data/raw/map.json` — the basemap **before** `territory.json` is applied. */
export interface MapSnapshot {
  why: string;
  fetchedAt: string;
  polygons: MapPolygon[];
}

export function loadCountrySnapshot(path: string): CountrySnapshot {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<CountrySnapshot>;
  if (!Array.isArray(raw.countries)) throw new Error(`${path}: \`countries\` must be a list`);
  if (typeof raw.year !== 'number') throw new Error(`${path}: \`year\` must be a number`);
  return {
    why: typeof raw.why === 'string' ? raw.why : '',
    fetchedAt: typeof raw.fetchedAt === 'string' ? raw.fetchedAt : '',
    year: raw.year,
    countries: raw.countries,
  };
}

export function loadMapSnapshot(path: string): MapSnapshot {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<MapSnapshot>;
  if (!Array.isArray(raw.polygons)) throw new Error(`${path}: \`polygons\` must be a list`);
  return {
    why: typeof raw.why === 'string' ? raw.why : '',
    fetchedAt: typeof raw.fetchedAt === 'string' ? raw.fetchedAt : '',
    polygons: raw.polygons,
  };
}

// ------------------------------------------------------------ serializing

/** `data/build/countries.json`: two-space JSON with a trailing newline. */
export const serializeCountries = (countries: readonly Country[]): string =>
  `${JSON.stringify(countries, null, 2)}\n`;

/**
 * `data/build/map.json`: compact, and every coordinate carries a decimal point.
 *
 * The committed basemap was written by Python, which renders a whole float as
 * `180.0`; `JSON.stringify` renders it as `180`. 135 coordinates are affected,
 * so a plain re-serialization would rewrite the file on a run that changed
 * nothing — and the byte-for-byte no-op is the property that makes `data:apply`
 * trustworthy. `pythonFloatRepr` is the formatter U2 already needed to
 * reproduce the shipped v7 build, reused rather than written twice.
 */
export const serializeMap = (polygons: readonly MapPolygon[]): string =>
  `[${polygons
    .map(
      (polygon) =>
        `{"iso3":${JSON.stringify(polygon.iso3)},"points":[${polygon.points
          .map((point) => `[${pythonFloatRepr(point[0])},${pythonFloatRepr(point[1])}]`)
          .join(',')}]}`,
    )
    .join(',')}]`;

export const serializeCountrySnapshot = (snapshot: CountrySnapshot): string =>
  `${JSON.stringify(snapshot, null, 2)}\n`;

/** Compact: 288 rings of up to 556 points would be 60,000 lines pretty-printed. */
export const serializeMapSnapshot = (snapshot: MapSnapshot): string => `${JSON.stringify(snapshot)}\n`;

// --------------------------------------------------------- the atomic set

export interface PendingWrite {
  path: string;
  text: string;
}

export interface AtomicOptions {
  /** Test seam: throw once this many files have been renamed into place. */
  failAfter?: number;
}

/**
 * Writes a set of files, all of them or none.
 *
 * `rename(2)` is atomic per file and there is no primitive that is atomic
 * across four of them, so the set is made atomic by hand: every replacement is
 * staged beside its target first, so a generation error writes nothing at all;
 * the originals are then moved aside, the staged files renamed in, and the
 * originals restored if any step fails. What this rules out is a run that
 * writes a new `countries.json` and then dies before `map.json` — a dataset
 * whose two halves disagree, silently becoming the baseline the next refresh
 * diffs against.
 */
export function writeAtomically(writes: readonly PendingWrite[], options: AtomicOptions = {}): void {
  const stamp = `${process.pid}.${Date.now().toString(36)}`;
  const staged = writes.map((write) => ({
    ...write,
    temp: `${write.path}.new-${stamp}`,
    backup: `${write.path}.old-${stamp}`,
  }));
  const renamed: typeof staged = [];
  const backedUp: typeof staged = [];

  try {
    for (const write of staged) {
      mkdirSync(dirname(write.path), { recursive: true });
      writeFileSync(write.temp, write.text);
    }
    for (const write of staged) {
      if (existsSync(write.path)) {
        renameSync(write.path, write.backup);
        backedUp.push(write);
      }
    }
    for (const write of staged) {
      if (options.failAfter !== undefined && renamed.length >= options.failAfter) {
        throw new Error(`simulated failure after ${renamed.length} of ${staged.length} files`);
      }
      renameSync(write.temp, write.path);
      renamed.push(write);
    }
  } catch (error) {
    for (const write of renamed) rmSync(write.path, { force: true });
    for (const write of backedUp) if (existsSync(write.backup)) renameSync(write.backup, write.path);
    for (const write of staged) rmSync(write.temp, { force: true });
    throw error;
  }

  for (const write of backedUp) rmSync(write.backup, { force: true });
}

// -------------------------------------------------------------- the merge

export interface BuildInput {
  snapshot: CountrySnapshot;
  map: MapSnapshot;
  overrides: OverrideBundle;
  bundle: LocaleBundle<typeof BASE_LOCALE>;
}

export interface BuiltDataset {
  countries: Country[];
  polygons: MapPolygon[];
  shadowed: ShadowedChange[];
}

/** Applies the override layer to a snapshot. The one place both commands share. */
export function buildDataset(input: BuildInput): BuiltDataset {
  const { countries, shadowed } = mergeCountries({
    fetched: input.snapshot.countries,
    overrides: input.overrides,
    bundles: [input.bundle],
  });
  return {
    countries: projectLocale(countries, BASE_LOCALE),
    polygons: applyTerritory(input.map.polygons, input.overrides.territory),
    shadowed,
  };
}

// ---------------------------------------------------------------- command

export interface ApplyOptions {
  root?: string;
  /** Report what would change and write nothing. */
  dryRun?: boolean;
  full?: boolean;
}

export interface ApplyResult {
  report: string[];
  changed: boolean;
  writes: PendingWrite[];
}

export function applyOverrides(options: ApplyOptions = {}): ApplyResult {
  const at = paths(options.root);
  const overrides = loadOverrides(at.overrides);
  const bundle = loadLocaleBundle(BASE_LOCALE, at.overrides);
  const snapshot = loadCountrySnapshot(at.rawCountries);
  const map = loadMapSnapshot(at.rawMap);

  const built = buildDataset({ snapshot, map, overrides, bundle });
  const countriesText = serializeCountries(built.countries);
  const mapText = serializeMap(built.polygons);

  const previousCountriesText = readFileSync(at.countries, 'utf8');
  const previousMapText = readFileSync(at.map, 'utf8');
  const diff = diffCountries(JSON.parse(previousCountriesText) as Country[], built.countries);
  diff.polygons = diffPolygons(JSON.parse(previousMapText) as MapPolygon[], built.polygons);

  const changed = countriesText !== previousCountriesText || mapText !== previousMapText;
  const report = [
    `data:apply — offline re-merge of data/raw/ (fetched ${snapshot.fetchedAt || 'unknown'}, year ${snapshot.year})`,
    '',
    ...renderCountryDiff({ diff, shadowed: built.shadowed, ...(options.full === true ? { full: true } : {}) }),
    ...renderPolygons(diff),
    ...renderShadowed(built.shadowed, options.full === true),
    '',
    changed
      ? options.dryRun === true
        ? 'data/build/ would change; nothing written (--dry-run).'
        : 'data/build/ rewritten.'
      : 'data/build/ is already what the snapshots and overrides produce; nothing to write.',
  ];

  const writes: PendingWrite[] = [
    { path: at.countries, text: countriesText },
    { path: at.map, text: mapText },
  ];
  if (changed && options.dryRun !== true) writeAtomically(writes);
  return { report, changed, writes };
}

const invoked = process.argv[1];
if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flag = (name: string): boolean => argv.includes(`--${name}`);
  const value = (name: string): string | undefined => {
    const at = argv.indexOf(`--${name}`);
    return at < 0 ? undefined : argv[at + 1];
  };
  try {
    const root = value('root');
    const result = applyOverrides({
      ...(root === undefined ? {} : { root }),
      dryRun: flag('dry-run'),
      full: flag('full'),
    });
    console.log(result.report.join('\n'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`data:apply failed — nothing was written.\n${detail}`);
    process.exit(1);
  }
}
