/**
 * `npm run data:check` — what has to be true of the dataset, whatever produced it.
 *
 * These are absolute assertions, not comparisons: they hold for the committed
 * baseline, for a refreshed candidate and for a dataset a maintainer hand-edited
 * at three in the morning. That is why the command runs in CI on every push
 * rather than only inside a refresh — a diff can only catch a change, and the
 * failures worth catching here are the ones that look like data.
 *
 * The population band is the clearest example. The WPP column is published in
 * thousands, and a refresh that forgets the multiplication produces a perfectly
 * well-formed dataset in which the world holds 8.3 million people. No diff rule
 * phrased as "how much may change" catches that, because everything changed;
 * only a statement about what a world population *is* does.
 *
 * The reproduction check is the other kind: `data/raw/` re-merged with
 * `data/overrides/` has to give `data/build/` back byte for byte. It is what
 * makes `data:apply` trustworthy — a snapshot that has drifted out of step with
 * the built dataset would otherwise be discovered by the next person who edited
 * a capital, in the form of two hundred unrelated changes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGIONS } from '../../src/engine/core.ts';
import type { Country } from '../../src/engine/types.ts';
import {
  BASE_LOCALE,
  buildDataset,
  loadCountrySnapshot,
  loadMapSnapshot,
  paths,
  serializeCountries,
  serializeMap,
} from './apply.ts';
import { loadLocaleBundle, loadOverrides, UNATTRIBUTED, type MapPolygon } from './merge.ts';
import { findRetiredSources, loadLock, type SourceEntry } from './sources.ts';

/** The world total the dataset has to land inside, in people. */
export const POPULATION_BAND = { min: 7.5e9, max: 9.5e9 } as const;

/** Countries in the game: the 193 UN members plus Palestine and the Holy See. */
export const COUNTRY_COUNT = 195;

/** Polygons at 1:110m, with room for an upstream release splitting an island. */
export const POLYGON_COUNT = { expected: 288, tolerance: 5 } as const;

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const ok = (name: string, detail: string): CheckResult => ({ name, ok: true, detail });
const bad = (name: string, detail: string): CheckResult => ({ name, ok: false, detail });

/** `20.0` where the baseline holds `20`, or `2e1` where it holds `20`. */
const INTEGRAL_FLOAT = /-?\d+\.0+(?=[,\]}\s])/g;
const EXPONENT = /-?\d+(?:\.\d+)?[eE][+-]?\d+/g;

const list = (items: readonly string[], limit = 8): string =>
  items.length <= limit ? items.join(', ') : `${items.slice(0, limit).join(', ')} … (+${items.length - limit})`;

/**
 * A dataset to assert over, whether it is on disk or a refresh candidate.
 *
 * The texts are carried alongside the parsed values because two of the
 * invariants — the numeric shape ones — are about how the numbers were
 * *written*, and that is gone by the time JSON.parse has run.
 */
export interface DatasetInput {
  countries: readonly Country[];
  polygons: readonly MapPolygon[];
  countriesText: string;
  mapText: string;
  overrides: ReturnType<typeof loadOverrides>;
  /** `data/build/flags.json`, keyed by ISO 3166-1 alpha-2. */
  flags: Readonly<Record<string, string>>;
  /** True when `assets/flags/<code>.png` exists. */
  hasFlagFile: (code: string) => boolean;
}

/** The invariants that need nothing but the dataset itself. */
export function datasetChecks(input: DatasetInput): CheckResult[] {
  const results: CheckResult[] = [];
  const { countries, polygons, countriesText, mapText, overrides, flags } = input;

  // --- scope ---------------------------------------------------------
  results.push(
    countries.length === COUNTRY_COUNT
      ? ok('country count', `${COUNTRY_COUNT} countries`)
      : bad('country count', `expected ${COUNTRY_COUNT}, found ${countries.length}`),
  );

  const codes = countries.map((country) => country.code as string);
  const duplicates = codes.filter((code, i) => codes.indexOf(code) !== i);
  results.push(
    duplicates.length === 0
      ? ok('unique codes', 'no ISO 3166-1 alpha-2 code appears twice')
      : bad('unique codes', `repeated: ${list(duplicates)}`),
  );

  // --- population ----------------------------------------------------
  const total = countries.reduce((sum, country) => sum + country.population, 0);
  results.push(
    total >= POPULATION_BAND.min && total <= POPULATION_BAND.max
      ? ok('world population', `${total.toLocaleString('en-US')} people, inside the band`)
      : bad(
          'world population',
          `${total.toLocaleString('en-US')} is outside ${POPULATION_BAND.min.toExponential(1)}–` +
            `${POPULATION_BAND.max.toExponential(1)}. A WPP column is published in thousands; ` +
            `check the ×1000 step before believing this number.`,
        ),
  );

  // --- every country is playable -------------------------------------
  const holes: string[] = [];
  for (const country of countries) {
    const code = country.code as string;
    if (country.capital.length === 0 || country.capital.some((city) => city === '')) holes.push(`${code} capital`);
    if (country.languages.length === 0) holes.push(`${code} languages`);
    if (country.languageNames.length !== country.languages.length) holes.push(`${code} languageNames`);
    if (country.currency.length === 0) holes.push(`${code} currency`);
    if (!(country.region in REGIONS)) holes.push(`${code} region "${country.region}"`);
    if (country.name === '') holes.push(`${code} name`);
    if (flags[code] === undefined) holes.push(`${code} flags.json`);
    if (!input.hasFlagFile(code)) holes.push(`${code} assets/flags/${code}.png`);
  }
  results.push(
    holes.length === 0
      ? ok('every country is playable', 'flag, capital, language, currency and region for all 195')
      : bad('every country is playable', list(holes, 12)),
  );

  // --- no sentinel codes reach the dataset ---------------------------
  const sentinelCountries = countries.filter(
    (country) => country.code === UNATTRIBUTED || country.iso3 === UNATTRIBUTED,
  );
  results.push(
    sentinelCountries.length === 0
      ? ok('no -99 country codes', 'every country carries a real ISO code')
      : bad('no -99 country codes', list(sentinelCountries.map((c) => c.name))),
  );

  // A `-99` polygon is legitimate only where a `territory.json` rule put it
  // there on purpose — Northern Cyprus, Somaliland and Kosovo are drawn as land
  // that no country question can highlight. One that arrives uncoded and
  // unclaimed is an upstream row nobody has decided about yet.
  const decided = overrides.territory.polygons.reassign.filter((rule) => rule.to === UNATTRIBUTED).length;
  const unattributed = polygons.filter((polygon) => polygon.iso3 === UNATTRIBUTED).length;
  results.push(
    unattributed === decided
      ? ok('every -99 polygon was decided', `${decided} left unattributed by an explicit rule`)
      : bad(
          'every -99 polygon was decided',
          `${unattributed} polygons carry -99 but territory.json only decides ${decided}. ` +
            `An upstream landmass arrived without a code and nobody has ruled on it.`,
        ),
  );

  // --- basemap size ---------------------------------------------------
  const drift = Math.abs(polygons.length - POLYGON_COUNT.expected);
  results.push(
    drift <= POLYGON_COUNT.tolerance
      ? ok('polygon count', `${polygons.length} polygons`)
      : bad(
          'polygon count',
          `${polygons.length} is more than ${POLYGON_COUNT.tolerance} away from ${POLYGON_COUNT.expected}`,
        ),
  );

  // --- numeric shape ---------------------------------------------------
  // Coordinates in `countries.json` are written by JSON.stringify, which emits
  // `20` for a whole number. An integral float there means the rounding step
  // produced `20.0` — a Python-shaped value in a JavaScript-written file, and a
  // sign that the number went through a formatter it should not have.
  // `map.json` is exempt by construction: it is Python-formatted end to end, so
  // every whole coordinate in it carries a `.0` on purpose.
  const integralFloats = countriesText.match(INTEGRAL_FLOAT) ?? [];
  const exponents = [...(countriesText.match(EXPONENT) ?? []), ...(mapText.match(EXPONENT) ?? [])];
  results.push(
    integralFloats.length === 0 && exponents.length === 0
      ? ok('numeric shape', 'no integral floats in countries.json, no exponent forms anywhere')
      : bad(
          'numeric shape',
          `${integralFloats.length} integral floats (${list(integralFloats, 5)}) and ` +
            `${exponents.length} exponent forms (${list(exponents, 5)})`,
        ),
  );

  return results;
}

/** Everything `datasetChecks` asserts, plus the two that need the repository. */
export function runChecks(root?: string): CheckResult[] {
  const at = paths(root);
  const countriesText = readFileSync(at.countries, 'utf8');
  const mapText = readFileSync(at.map, 'utf8');
  return [
    ...datasetChecks({
      countries: JSON.parse(countriesText) as Country[],
      polygons: JSON.parse(mapText) as MapPolygon[],
      countriesText,
      mapText,
      overrides: loadOverrides(at.overrides),
      flags: JSON.parse(readFileSync(at.flags, 'utf8')) as Record<string, string>,
      hasFlagFile: (code) => existsSync(join(at.root, 'assets/flags', `${code}.png`)),
    }),
    reproduction(at, countriesText, mapText),
    ...provenance(at),
  ];
}

/** Re-merges the snapshots and compares the bytes. The gate `data:apply` rests on. */
function reproduction(at: ReturnType<typeof paths>, countriesText: string, mapText: string): CheckResult {
  const name = 'data/raw/ reproduces data/build/';
  try {
    const built = buildDataset({
      snapshot: loadCountrySnapshot(at.rawCountries),
      map: loadMapSnapshot(at.rawMap),
      overrides: loadOverrides(at.overrides),
      bundle: loadLocaleBundle(BASE_LOCALE, at.overrides),
    });
    const mismatches: string[] = [];
    if (serializeCountries(built.countries) !== countriesText) mismatches.push('countries.json');
    if (serializeMap(built.polygons) !== mapText) mismatches.push('map.json');
    return mismatches.length === 0
      ? ok(name, 'the snapshots plus the overrides give the committed dataset back, byte for byte')
      : bad(
          name,
          `${mismatches.join(' and ')} would change. Either data/build/ was edited by hand, or ` +
            `data/raw/ is from a different fetch than the one that produced it. ` +
            `Run npm run data:apply -- --dry-run to see what moved.`,
        );
  } catch (error) {
    return bad(name, error instanceof Error ? error.message : String(error));
  }
}

/** The notices have to name what the fetchers read, and nothing they do not. */
function provenance(at: ReturnType<typeof paths>): CheckResult[] {
  const results: CheckResult[] = [];
  const noticesText = readFileSync(at.notices, 'utf8');
  const sourcesText = readFileSync(at.sources, 'utf8');
  const files = [
    { path: 'data/embedded-notices.txt', text: noticesText },
    { path: 'data/build/sources.json', text: sourcesText },
  ];

  const retired = findRetiredSources(files);
  results.push(
    retired.length === 0
      ? ok('no retired sources credited', 'nothing credits Worldometer, CountryInfo, Babel, pyogrio or pycountry')
      : bad(
          'no retired sources credited',
          retired
            .map((mention) => `${mention.file}:${mention.line} names "${mention.needle}" — ${mention.text}`)
            .join('\n    '),
        ),
  );

  try {
    const lock = loadLock(at.lock);
    const entries = JSON.parse(sourcesText) as SourceEntry[];
    const uncredited: string[] = [];
    for (const [id, pin] of Object.entries(lock.remote)) {
      const credited = entries.some((entry) => entry.url === pin.url) && noticesText.includes(pin.sha256);
      if (!credited) uncredited.push(id);
    }
    if (!noticesText.includes('ODbL')) uncredited.push('world-countries (no ODbL notice)');
    results.push(
      uncredited.length === 0
        ? ok('every pinned source is credited', `${Object.keys(lock.remote).length} downloads and the ODbL notice`)
        : bad('every pinned source is credited', `missing from the notices: ${list(uncredited)}`),
    );
  } catch (error) {
    results.push(bad('every pinned source is credited', error instanceof Error ? error.message : String(error)));
  }

  results.push(
    existsSync(join(at.root, 'licenses/ODbL-1.0.txt'))
      ? ok('ODbL text ships', 'licenses/ODbL-1.0.txt is present and the deploy copies licenses/')
      : bad('ODbL text ships', 'licenses/ODbL-1.0.txt is missing — the share-alike obligation needs the text'),
  );
  return results;
}

export const renderChecks = (results: readonly CheckResult[]): string[] =>
  results.map((result) => `${result.ok ? '  ok  ' : ' FAIL '} ${result.name}: ${result.detail}`);

const invoked = process.argv[1];
if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--root');
  const root = at < 0 ? undefined : argv[at + 1];
  const results = runChecks(root);
  console.log('data:check — dataset invariants\n');
  console.log(renderChecks(results).join('\n'));
  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) process.exit(1);
}
