/**
 * U9 — the refresh pipeline, exercised end to end without a network.
 *
 * Every scenario here runs against a throwaway copy of `data/` under the system
 * tmpdir, never against the repository: `--accept` writes seven files, and the
 * one thing this unit must never do is write them into the committed tree. The
 * first refresh is a *source substitution* — v7's populations were transcribed
 * from Worldometer and its geometry lifted from a pyogrio fixture — so
 * accepting it against the real `data/build/` would move the dataset the golden
 * fixtures were captured from. That is a reviewed decision, not a test.
 *
 * The upstream payloads are synthesized from the committed `data/raw/`
 * snapshots rather than downloaded, which keeps `npm test` offline and
 * deterministic. `tests/unit/data-network.test.ts` is where the real endpoints
 * are read, and it is opt-in.
 *
 * The guards get the same treatment the U8 suite gave the override layer: each
 * one is shown failing on a perturbed input, because a guard nobody has watched
 * fail is a guard nobody knows is wired up.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  cpSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyOverrides,
  loadCountrySnapshot,
  loadMapSnapshot,
  serializeCountries,
  serializeMap,
  writeAtomically,
} from '../../scripts/data/apply.ts';
import { datasetChecks, runChecks, type CheckResult } from '../../scripts/data/check.ts';
import { diffCountries, populationAlarms } from '../../scripts/data/diff.ts';
import { parseCsv, reducePopulation } from '../../scripts/data/fetchers/population.ts';
import { parseGeometry } from '../../scripts/data/fetchers/geometry.ts';
import { readReference } from '../../scripts/data/fetchers/reference.ts';
import { applyTerritory, loadOverrides, UNATTRIBUTED, type MapPolygon } from '../../scripts/data/merge.ts';
import { refresh } from '../../scripts/data/refresh.ts';
import {
  fetchPinned,
  loadLock,
  REMOTE_SOURCES,
  serializeLock,
  sha256,
  type Transport,
} from '../../scripts/data/sources.ts';
import type { Country } from '../../src/engine/types.ts';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const at = (relative: string) => join(REPO, relative);

const baseline = JSON.parse(readFileSync(at('data/build/countries.json'), 'utf8')) as Country[];
const rawCountries = loadCountrySnapshot(at('data/raw/countries.json'));
const rawMap = loadMapSnapshot(at('data/raw/map.json'));
const overrides = loadOverrides(at('data/overrides'));

// ------------------------------------------------------------ the fixture

const trash: (() => void)[] = [];
afterEach(() => {
  while (trash.length > 0) trash.pop()?.();
});

interface Fixture {
  root: string;
  read(relative: string): string;
  write(relative: string, text: string): void;
}

/**
 * A copy of everything the three commands read.
 *
 * The flag PNGs are created empty rather than copied: `data:check` asserts that
 * `assets/flags/<code>.png` *exists*, and 195 real images would put 1.5 MB
 * through the filesystem for every scenario that writes.
 *
 * `THIRD_PARTY_NOTICES.txt` and `src/app/dialogs/sources.ts` are here because
 * an accept rewrites the first and `data:check` reads the edition date out of
 * the second. Neither is data, and both are claims about the data.
 */
function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'wg-data-'));
  trash.push(() => rmSync(root, { recursive: true, force: true }));
  for (const dir of ['data/overrides', 'data/raw', 'data/build']) {
    cpSync(at(dir), join(root, dir), { recursive: true });
  }
  mkdirSync(join(root, 'licenses'), { recursive: true });
  copyFileSync(at('licenses/ODbL-1.0.txt'), join(root, 'licenses/ODbL-1.0.txt'));
  mkdirSync(join(root, 'assets/flags'), { recursive: true });
  for (const country of baseline) writeFileSync(join(root, 'assets/flags', `${country.code}.png`), '');
  copyFileSync(at('data/embedded-notices.txt'), join(root, 'data/embedded-notices.txt'));
  copyFileSync(at('THIRD_PARTY_NOTICES.txt'), join(root, 'THIRD_PARTY_NOTICES.txt'));
  mkdirSync(join(root, 'src/app/dialogs'), { recursive: true });
  copyFileSync(at('src/app/dialogs/sources.ts'), join(root, 'src/app/dialogs/sources.ts'));

  return {
    root,
    read: (relative) => readFileSync(join(root, relative), 'utf8'),
    write: (relative, text) => writeFileSync(join(root, relative), text),
  };
}

/** Re-stamps every row's provenance tag, which is what an accept does. */
function stampSource(place: Fixture, source: string, every = true): void {
  place.write(
    'data/build/countries.json',
    serializeCountries(
      baseline.map((country, i) => (every || i % 2 === 0 ? { ...country, populationSource: source } : country)),
    ),
  );
}

/** The frozen v7 notices, which credit Worldometer, CountryInfo, Babel and pyogrio. */
function seedLegacyNotices(place: Fixture): void {
  const v7 = readFileSync(at('tests/fixtures/baseline/embedded-notices.txt'), 'utf8');
  place.write('data/embedded-notices.txt', v7);
  place.write('THIRD_PARTY_NOTICES.txt', v7);
  place.write('data/build/sources.json', readFileSync(at('tests/fixtures/baseline/data/sources.json'), 'utf8'));
}

// ------------------------------------------------------- synthetic upstream

const WPP_HEADER = [
  'SortOrder', 'LocID', 'Notes', 'ISO3_code', 'ISO2_code', 'SDMX_code', 'LocTypeID',
  'LocTypeName', 'ParentID', 'Location', 'VarID', 'Variant', 'Time', 'TPopulation1Jan',
  'TPopulation1July',
];

/**
 * A WPP CSV in the real file's shape, populated from the committed snapshot.
 *
 * It carries the three rows a naive parser gets wrong: an aggregate with a
 * blank `ISO3_code` and a quoted comma in `Location`, a row for a year the
 * refresh must ignore, and a `LocTypeName` that is not `Country/Area`.
 */
function wppCsv(year = 2026, tweaks: Readonly<Record<string, number>> = {}): string {
  const lines = [WPP_HEADER.join(',')];
  const row = (values: Readonly<Record<string, string | number>>): string =>
    WPP_HEADER.map((column) => String(values[column] ?? '')).join(',');

  lines.push(
    row({
      LocID: 1200,
      LocTypeName: 'Region',
      Location: '"African, Caribbean and Pacific (ACP) Group of States"',
      Time: year,
      TPopulation1July: 1_500_000,
    }),
  );
  for (const country of rawCountries.countries) {
    const population = tweaks[country.code] ?? country.population;
    lines.push(
      row({
        SortOrder: 1,
        LocID: 900,
        ISO3_code: country.iso3,
        ISO2_code: country.code,
        LocTypeID: 4,
        LocTypeName: 'Country/Area',
        Location: country.text.cs?.name ?? country.code,
        VarID: 2,
        Variant: 'Medium',
        Time: year,
        TPopulation1July: population / 1000,
      }),
    );
    // The same country a year earlier, so the year filter has something to drop.
    lines.push(
      row({
        ISO3_code: country.iso3,
        LocTypeName: 'Country/Area',
        Location: country.code,
        Time: year - 1,
        TPopulation1July: 1,
      }),
    );
  }
  return `﻿${lines.join('\n')}\n`;
}

/** The Natural Earth file's shape, built from the committed pre-territory basemap. */
function geojson(polygons: readonly MapPolygon[] = rawMap.polygons): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: polygons.map((polygon) => ({
      type: 'Feature',
      properties: { ISO_A3: polygon.iso3, ISO_A3_EH: polygon.iso3, NAME: polygon.iso3 },
      geometry: { type: 'Polygon', coordinates: [polygon.points] },
    })),
  });
}

interface Upstream {
  transport: Transport;
  csv: Buffer;
  geo: Buffer;
}

/** Pins the synthetic payloads into the fixture's lock and hands back a transport. */
function pin(place: Fixture, csvText = wppCsv(), geoText = geojson()): Upstream {
  const csv = gzipSync(Buffer.from(csvText, 'utf8'));
  const geo = Buffer.from(geoText, 'utf8');
  const lock = loadLock(join(place.root, 'data/raw/sources.lock.json'));
  lock.remote['un-wpp'] = {
    url: REMOTE_SOURCES['un-wpp']!.url,
    sha256: sha256(csv),
    bytes: csv.byteLength,
    accessed: '2026-09-10',
  };
  lock.remote['natural-earth'] = {
    url: REMOTE_SOURCES['natural-earth']!.url,
    sha256: sha256(geo),
    bytes: geo.byteLength,
    accessed: '2026-09-10',
  };
  place.write('data/raw/sources.lock.json', serializeLock(lock));

  const transport: Transport = (url) =>
    Promise.resolve({ url, bytes: url.includes('WPP2024') ? csv : geo });
  return { transport, csv, geo };
}

const run = (place: Fixture, upstream: Upstream, options: Record<string, unknown> = {}) =>
  refresh({
    root: place.root,
    transport: upstream.transport,
    today: '2026-09-10',
    gitStatus: () => '',
    ...options,
  });

const failures = (results: readonly CheckResult[]): string[] =>
  results.filter((result) => !result.ok).map((result) => result.name);

// ------------------------------------------------------------------ tests

describe('the WPP CSV parser', () => {
  it('keeps a comma inside a quoted field in one column', () => {
    const rows = parseCsv('a,b,c\n1,"two, and a half",3\n');
    expect(rows[1]).toEqual(['1', 'two, and a half', '3']);
  });

  it('keeps a newline inside a quoted field in one row', () => {
    const rows = parseCsv('a,b\n1,"line one\nline two"\n');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(['1', 'line one\nline two']);
  });

  it('reads a doubled quote as one literal quote', () => {
    expect(parseCsv('a\n"he said ""no"""\n')[1]).toEqual(['he said "no"']);
  });

  it('strips a UTF-8 BOM so the first column keeps its name', () => {
    expect(parseCsv('﻿ISO3_code,Time\nCZE,2026\n')[0]).toEqual(['ISO3_code', 'Time']);
  });

  it('multiplies the published thousands by 1000', () => {
    const rows = reducePopulation(wppCsv(), 2026);
    const czechia = rows.find((row) => row.iso3 === 'CZE');
    expect(czechia?.population).toBe(baseline.find((c) => c.code === 'CZ')?.population);
    // Every one of the 195 survives the float round-trip through thousands.
    const byIso3 = new Map(rows.map((row) => [row.iso3, row.population]));
    for (const country of baseline) expect(byIso3.get(country.iso3)).toBe(country.population);
  });

  it('excludes an aggregate row with a blank ISO3_code, quoted comma and all', () => {
    const rows = reducePopulation(wppCsv(), 2026);
    expect(rows).toHaveLength(195);
    expect(rows.some((row) => row.iso3 === '')).toBe(false);
    expect(rows.some((row) => row.location.includes('ACP'))).toBe(false);
  });

  it('keeps only the target year', () => {
    expect(reducePopulation(wppCsv(2026), 2026).every((row) => row.year === 2026)).toBe(true);
    expect(() => reducePopulation(wppCsv(2026), 2030)).toThrow(/no Country\/Area rows for 2030/);
  });

  it('names the column when upstream changes shape', () => {
    expect(() => reducePopulation('ISO3_code,Time\nCZE,2026\n', 2026)).toThrow(/no `LocTypeName` column/);
  });
});

describe('geometry', () => {
  it('reads ISO_A3, leaving France, Norway and the three disputed rows uncoded', () => {
    const polygons = parseGeometry(geojson());
    expect(polygons).toHaveLength(288);
    // KTD9 would have read ISO_A3_EH, which pre-codes France and Norway and so
    // starves seven of the ten territory.json rules of anything to match.
    expect(polygons.filter((polygon) => polygon.iso3 === UNATTRIBUTED)).toHaveLength(10);
  });

  it('routes every uncoded polygon through territory.json and lands on 288', () => {
    const resolved = applyTerritory(parseGeometry(geojson()), overrides.territory);
    expect(resolved).toHaveLength(288);
    expect(resolved.filter((polygon) => polygon.iso3 === 'FRA')).toHaveLength(3);
    expect(resolved.filter((polygon) => polygon.iso3 === 'NOR')).toHaveLength(4);
    // Northern Cyprus, Somaliland and Kosovo stay unattributed on purpose.
    expect(resolved.filter((polygon) => polygon.iso3 === UNATTRIBUTED)).toHaveLength(3);
    expect(serializeMap(resolved)).toBe(readFileSync(at('data/build/map.json'), 'utf8'));
  });

  it('loses no precision writing the basemap, and keeps none of the Python formatting', () => {
    // The claim `serializeMap` rests on, asserted rather than argued: dropping
    // the `.0` that CPython printed on 135 whole coordinates changes how the
    // file reads and not one double it parses to. Checked over every
    // coordinate, both directions, with Object.is so -0 cannot pass as 0.
    const text = readFileSync(at('data/build/map.json'), 'utf8');
    const polygons = JSON.parse(text) as MapPolygon[];
    const reparsed = JSON.parse(serializeMap(polygons)) as MapPolygon[];

    let coordinates = 0;
    for (const [i, polygon] of polygons.entries()) {
      const back = reparsed[i] as MapPolygon;
      expect(back.iso3).toBe(polygon.iso3);
      expect(back.points).toHaveLength(polygon.points.length);
      for (const [j, point] of polygon.points.entries()) {
        for (const k of [0, 1] as const) {
          coordinates += 1;
          expect(Object.is(back.points[j]![k], point[k])).toBe(true);
        }
      }
    }
    expect(coordinates).toBe(21_284);

    // Three decimals is what `round3` promises; a coordinate needing four would
    // mean the rounding produced a value JSON has to print longhand.
    const longest = Math.max(
      ...polygons.flatMap((polygon) =>
        polygon.points.flatMap((point) => point.map((value) => (String(value).split('.')[1] ?? '').length)),
      ),
    );
    expect(longest).toBe(3);
    expect(text).not.toMatch(/-?\d+\.0(?![0-9])/);

    // …and the frozen U2 input keeps its 135, because the byte-identity hash is
    // computed over it and normalizing it would erase the evidence.
    expect(readFileSync(at('tests/fixtures/baseline/data/map.json'), 'utf8')).toContain('180.0');
  });

  it('drops a ring of three points or fewer, and keeps the four-point one', () => {
    const tiny: MapPolygon = { iso3: 'XXA', points: [[0, 0], [1, 0], [0, 0]] };
    const small: MapPolygon = { iso3: 'XXB', points: [[0, 0], [1, 0], [1, 1], [0, 0]] };
    expect(parseGeometry(geojson([tiny, small])).map((polygon) => polygon.iso3)).toEqual(['XXB']);
  });

  it('fails when upstream drops the property the code is read from', () => {
    const broken = JSON.stringify({
      features: [{ properties: { NAME: 'X' }, geometry: { type: 'Polygon', coordinates: [[]] } }],
    });
    expect(() => parseGeometry(broken)).toThrow(/no `ISO_A3` property/);
  });
});

describe('the country set', () => {
  it('is the 193 UN members plus Palestine and the Holy See, and matches the dataset', () => {
    const reference = readReference();
    expect(reference).toHaveLength(195);
    expect(reference.map((country) => country.code).sort()).toEqual(
      baseline.map((country) => country.code as string).sort(),
    );
  });
});

describe('data:refresh in report mode', () => {
  it('leaves data/build/ untouched and still emits a report', async () => {
    const place = fixture();
    const upstream = pin(place);
    const before = ['countries.json', 'map.json', 'sources.json'].map((name) =>
      place.read(`data/build/${name}`),
    );
    const notices = place.read('data/embedded-notices.txt');

    const result = await run(place, upstream);

    expect(result.accepted).toBe(false);
    expect(['countries.json', 'map.json', 'sources.json'].map((name) => place.read(`data/build/${name}`))).toEqual(
      before,
    );
    expect(place.read('data/embedded-notices.txt')).toBe(notices);
    expect(result.report.join('\n')).toContain('Report only — data/build/ was not modified');
    expect(result.report.join('\n')).toMatch(/^countries: \d+ added, \d+ removed, \d+ changed$/m);
  });

  it('lists a shadowed change when an override suppresses a differing upstream value', async () => {
    const place = fixture();
    const report = (await run(place, pin(place), { full: true })).report.join('\n');
    // Upstream files Cyprus under Europe; regions.json puts it in Asia, and the
    // suppressed value is exactly what a maintainer needs to see.
    expect(report).toContain('shadowed:');
    expect(report).toContain('CY region: Europe ⇠ Asia');
    expect(report).toContain('regions.json:');
  });

  it('reports what an upstream hash change would be, and refuses to read past it', async () => {
    const place = fixture();
    const upstream = pin(place);
    const lock = loadLock(join(place.root, 'data/raw/sources.lock.json'));
    lock.remote['natural-earth']!.sha256 = 'f'.repeat(64);
    place.write('data/raw/sources.lock.json', serializeLock(lock));

    await expect(run(place, upstream)).rejects.toThrow(
      /changed upstream at the same URL[\s\S]*--accept-source-change/,
    );
    const allowed = await run(place, upstream, { acceptSourceChange: true });
    expect(allowed.report.join('\n')).toContain('natural-earth [changed]');
  });

  it('fails clearly on an unreachable URL and writes nothing', async () => {
    const place = fixture();
    const before = place.read('data/build/countries.json');
    const dead: Transport = () => Promise.reject(new Error('getaddrinfo ENOTFOUND population.un.org'));

    await expect(
      refresh({ root: place.root, transport: dead, today: '2026-09-10', gitStatus: () => '' }),
    ).rejects.toThrow(
      /UN World Population Prospects[\s\S]*ENOTFOUND[\s\S]*Nothing was fetched and nothing was written/,
    );
    expect(place.read('data/build/countries.json')).toBe(before);
  });
});

describe('the guards, shown failing', () => {
  it('makes a per-country population move over 25 % fatal', async () => {
    const place = fixture();
    const czechia = baseline.find((country) => country.code === 'CZ')!;
    const upstream = pin(place, wppCsv(2026, { CZ: Math.round(czechia.population * 0.5) }));

    const result = await run(place, upstream);
    const report = result.report.join('\n');
    expect(report).toContain('BLOCKED — nothing written');
    expect(report).toMatch(/CZ Česko population moved -50\.0 %/);
    expect(result.accepted).toBe(false);
    await expect(run(place, upstream, { accept: true })).rejects.toThrow(/refused to write[\s\S]*CZ Česko/);
  });

  it('flags the 25 % alarm from a diff alone, and stays quiet under it', () => {
    const bump = (factor: number): Country[] =>
      baseline.map((country) =>
        country.code === 'CZ' ? { ...country, population: Math.round(country.population * factor) } : country,
      );
    expect(populationAlarms(diffCountries(baseline, bump(1.26)).population)).toHaveLength(1);
    expect(populationAlarms(diffCountries(baseline, bump(1.24)).population)).toHaveLength(0);
  });

  it('fails the world-population band on the 1000× unit mistake', () => {
    const thousands = baseline.map((country) => ({ ...country, population: Math.round(country.population / 1000) }));
    const results = datasetChecks(datasetInput(thousands));
    expect(failures(results)).toContain('world population');
    expect(results.find((result) => result.name === 'world population')?.detail).toMatch(/published in thousands/);
  });

  it('fails on a missing flag file, naming the country', () => {
    const results = datasetChecks({ ...datasetInput(baseline), hasFlagFile: (code) => code !== 'CZ' });
    expect(failures(results)).toContain('every country is playable');
    expect(results.find((result) => result.name === 'every country is playable')?.detail).toContain(
      'CZ assets/flags/CZ.png',
    );
  });

  it('fails on a -99 country code', () => {
    const broken = baseline.map((country) =>
      country.code === 'CZ' ? { ...country, iso3: UNATTRIBUTED as Country['iso3'] } : country,
    );
    expect(failures(datasetChecks(datasetInput(broken)))).toContain('no -99 country codes');
  });

  it('fails on an exclusion list that narrowed, in either of the two ways', () => {
    // (1) The country speaks a language it does not exclude — the direct route
    // to a language question with two correct answers.
    const speaks = baseline.map((country) =>
      country.code === 'CH'
        ? { ...country, excludeLanguages: country.excludeLanguages.filter((tag) => tag !== 'de') }
        : country,
    );
    const spoken = datasetChecks(datasetInput(speaks));
    expect(failures(spoken)).toContain('exclusion lists only widen');
    expect(spoken.find((result) => result.name === 'exclusion lists only widen')?.detail).toContain(
      'CH speaks but does not exclude de',
    );

    // (2) A frozen CLDR entry that did not survive the merge. `gsw` is Swiss
    // German: not one of the four national languages the question offers, and
    // exactly the kind of tag a rebuilt pipeline loses.
    const frozen = baseline.map((country) =>
      country.code === 'CH'
        ? { ...country, excludeLanguages: country.excludeLanguages.filter((tag) => tag !== 'gsw') }
        : country,
    );
    const dropped = datasetChecks(datasetInput(frozen));
    expect(failures(dropped)).toContain('exclusion lists only widen');
    expect(dropped.find((result) => result.name === 'exclusion lists only widen')?.detail).toContain(
      'CH dropped the frozen gsw',
    );
  });

  it('fails on a label that is only a code, in either field', () => {
    // Both are live: a refresh today gives Belize `bjz` and Tuvalu `TVD`, and
    // CLDR has a Czech name for neither.
    const tag = baseline.map((country) =>
      country.code === 'BZ'
        ? { ...country, languages: ['bjz'] as Country['languages'], languageNames: ['bjz'] }
        : country,
    );
    const byTag = datasetChecks(datasetInput(tag));
    expect(failures(byTag)).toContain('every label is a word');
    expect(byTag.find((result) => result.name === 'every label is a word')?.detail).toContain('BZ language bjz');

    const unit = baseline.map((country) =>
      country.code === 'TV'
        ? { ...country, currencyNames: [{ code: 'TVD' as Country['currency'][number], name: 'TVD' }] }
        : country,
    );
    expect(failures(datasetChecks(datasetInput(unit)))).toContain('every label is a word');
  });

  it('fails on a polygon nobody decided to leave unattributed', () => {
    const polygons = JSON.parse(readFileSync(at('data/build/map.json'), 'utf8')) as MapPolygon[];
    const orphaned = polygons.map((polygon, i) => (i === 0 ? { ...polygon, iso3: UNATTRIBUTED } : polygon));
    const results = datasetChecks({ ...datasetInput(baseline), polygons: orphaned });
    expect(failures(results)).toContain('every -99 polygon was decided');
  });

  it('fails on an integral float in a coordinate, in either file', () => {
    const text = serializeCountries(baseline).replace('"lat": 33,', '"lat": 33.0,');
    expect(failures(datasetChecks({ ...datasetInput(baseline), countriesText: text }))).toContain('numeric shape');

    // map.json used to be exempt from this check — it was Python-formatted end
    // to end and held 135 of these on purpose. It is not exempt any more, and a
    // reverted `serializeMap` would put all 135 back.
    const mapText = datasetInput(baseline).mapText.replace('[180,', '[180.0,');
    expect(failures(datasetChecks({ ...datasetInput(baseline), mapText }))).toContain('numeric shape');
  });

  it('fails when the polygon count drifts past the tolerance', () => {
    const polygons = JSON.parse(readFileSync(at('data/build/map.json'), 'utf8')) as MapPolygon[];
    expect(failures(datasetChecks({ ...datasetInput(baseline), polygons: polygons.slice(0, 282) }))).toContain(
      'polygon count',
    );
    expect(failures(datasetChecks({ ...datasetInput(baseline), polygons: polygons.slice(0, 283) }))).not.toContain(
      'polygon count',
    );
  });

  it('fails when data/raw/ no longer reproduces data/build/', () => {
    const place = fixture();
    const snapshot = loadCountrySnapshot(join(place.root, 'data/raw/countries.json'));
    snapshot.countries[0]!.population = 1;
    place.write('data/raw/countries.json', `${JSON.stringify(snapshot, null, 2)}\n`);
    const result = runChecks(place.root).find((check) => check.name === 'data/raw/ reproduces data/build/');
    expect(result?.ok).toBe(false);
    expect(result?.detail).toContain('countries.json would change');
  });

  it('fails when the notices describe a pipeline that did not produce the data', () => {
    // The U9 defect: the provenance regen runs, `countries.json` is left as the
    // archived script built it, and the shipped game then credits a
    // sha256-pinned download and an ODbL derivative database for numbers
    // neither one ever touched. Written by stamping the dataset rather than by
    // rewriting the notices, so it keeps testing this whichever pipeline last
    // produced the committed tree.
    const place = fixture();
    stampSource(place, 'worldometer-un-2026');

    const result = runChecks(place.root).find((check) => check.name === 'provenance matches the dataset');
    expect(result?.ok).toBe(false);
    expect(result?.detail).toContain('Worldometer');
    expect(result?.detail).toContain('CountryInfo');
    expect(result?.detail).toContain('un-wpp');
    expect(result?.detail).toContain('ODbL share-alike');
  });

  it('fails the other way too, when the data moved and the notices did not', () => {
    // The mirror failure: an accept that wrote `countries.json` and left the
    // notices behind. Symmetry is the point — a check that only fires one way
    // would let half of any future substitution through.
    const place = fixture();
    seedLegacyNotices(place);

    const results = runChecks(place.root);
    expect(failures(results)).toContain('no retired sources credited');
    expect(failures(results)).toContain('every pinned source is credited');
  });

  it('fails on a dataset that is half one pipeline and half the other', () => {
    const place = fixture();
    stampSource(place, 'worldometer-un-2026', false);

    const result = runChecks(place.root).find((check) => check.name === 'provenance matches the dataset');
    expect(result?.ok).toBe(false);
    expect(result?.detail).toContain('half-applied');
  });

  it('fails when the ODbL text is not shipped beside a dataset that needs it', () => {
    // Only in pipeline mode: the share-alike obligation arrives with the data
    // that is derived from `world-countries`, not before it.
    const place = fixture();
    expect(failures(runChecks(place.root))).not.toContain('ODbL text ships');

    rmSync(join(place.root, 'licenses/ODbL-1.0.txt'));
    expect(failures(runChecks(place.root))).toContain('ODbL text ships');

    // …and it is not asked of the legacy dataset, which is not derived from it.
    stampSource(place, 'worldometer-un-2026');
    seedLegacyNotices(place);
    expect(failures(runChecks(place.root))).not.toContain('ODbL text ships');
  });

  it('fails when only one notice document carries the flag provenance', () => {
    // U10 added a fifth pinned download, and a fifth generated block with it.
    // The two documents are written together by one accept, so a block that
    // agrees in the served copy and not in the inlined one means somebody
    // edited provenance by hand — which is the only way it can go wrong now.
    const place = fixture();
    place.write(
      'THIRD_PARTY_NOTICES.txt',
      place.read('THIRD_PARTY_NOTICES.txt').replace(
        '\nFLAG ILLUSTRATIONS\n',
        '\nFLAG ILLUSTRATIONS\nRendered from whichever colour emoji font the machine had.\n',
      ),
    );

    expect(failures(runChecks(place.root))).toContain('both notice documents agree');
  });

  it('rewrites both notice documents on an accept, not only the embedded one', async () => {
    // THIRD_PARTY_NOTICES.txt is the copy the deploy serves beside the game.
    // U9 updated only `data/embedded-notices.txt`, and this one kept crediting
    // CountryInfo for a dataset that had moved on.
    const place = fixture();
    seedLegacyNotices(place);
    for (const file of ['data/embedded-notices.txt', 'THIRD_PARTY_NOTICES.txt']) {
      expect(place.read(file)).toContain('CountryInfo');
    }

    await run(place, pin(place), { accept: true });

    for (const file of ['data/embedded-notices.txt', 'THIRD_PARTY_NOTICES.txt']) {
      expect(place.read(file).toLowerCase()).not.toContain('countryinfo');
      expect(place.read(file)).toContain(loadLock(join(place.root, 'data/raw/sources.lock.json')).remote['un-wpp']!.sha256);
    }
    expect(failures(runChecks(place.root))).toEqual([]);
  });
});

describe('data:refresh --accept', () => {
  it('refuses to run when data/ is dirty in git', async () => {
    const place = fixture();
    const upstream = pin(place);
    const before = place.read('data/build/countries.json');

    await expect(
      run(place, upstream, { accept: true, gitStatus: () => ' M data/overrides/capitals.json\n' }),
    ).rejects.toThrow(/data\/ has uncommitted changes[\s\S]*capitals\.json/);
    expect(place.read('data/build/countries.json')).toBe(before);
  });

  it('writes the whole set, and the result passes data:check', async () => {
    const place = fixture();
    // One population moved, because the synthetic upstream is built from the
    // committed snapshot: an accept over an identical fetch writes the same
    // bytes back and `not.toBe(before)` would be asserting nothing.
    const upstream = pin(place, wppCsv(2026, { CZ: 11_000_000 }));
    const before = place.read('data/build/countries.json');

    const result = await run(place, upstream, { accept: true });

    expect(result.accepted).toBe(true);
    expect(result.writes.map((write) => write.path.slice(place.root.length + 1)).sort()).toEqual([
      'THIRD_PARTY_NOTICES.txt',
      'data/build/countries.json',
      'data/build/map.json',
      'data/build/sources.json',
      'data/embedded-notices.txt',
      'data/raw/countries.json',
      'data/raw/map.json',
      'data/raw/sources.lock.json',
      'src/app/dialogs/sources.ts',
    ]);
    expect(place.read('data/build/countries.json')).not.toBe(before);
    // No leftovers from the staging step.
    expect(readdirSync(join(place.root, 'data/build')).sort()).toEqual([
      'countries.json', 'flags.json', 'map.json', 'sources.json',
    ]);
    expect(failures(runChecks(place.root))).toEqual([]);
  });

  it('stops crediting Worldometer, CountryInfo, Babel and pyogrio', async () => {
    const place = fixture();
    seedLegacyNotices(place);
    for (const needle of ['Worldometer', 'CountryInfo', 'Babel', 'pyogrio']) {
      expect(place.read('data/embedded-notices.txt')).toContain(needle);
    }

    await run(place, pin(place), { accept: true });

    const notices = place.read('data/embedded-notices.txt').toLowerCase();
    const sources = place.read('data/build/sources.json').toLowerCase();
    for (const needle of ['worldometer', 'countryinfo', 'babel', 'pyogrio', 'pycountry']) {
      expect(notices).not.toContain(needle);
      expect(sources).not.toContain(needle);
    }
    // …and names what it does read, by hash.
    const lock = loadLock(join(place.root, 'data/raw/sources.lock.json'));
    expect(place.read('data/embedded-notices.txt')).toContain(lock.remote['natural-earth']!.sha256);
    expect(place.read('data/embedded-notices.txt')).toContain('OPEN DATABASE LICENSE (ODbL 1.0)');
    expect(place.read('data/build/sources.json')).toContain('ODC-ODbL 1.0');
  });
});

describe('the atomic set', () => {
  const three = (root: string) => ['a.json', 'b.json', 'c.json'].map((name) => join(root, name));

  it('replaces every file or none of them', () => {
    const root = mkdtempSync(join(tmpdir(), 'wg-atomic-'));
    trash.push(() => rmSync(root, { recursive: true, force: true }));
    const files = three(root);
    for (const file of files) writeFileSync(file, 'original');
    const writes = files.map((path) => ({ path, text: 'replacement' }));

    // Fail after the first rename: without the restore step, `a.json` would
    // already be the new dataset and `b.json` the old one — a mixed pair that
    // the next refresh would diff against as if it were the truth.
    expect(() => writeAtomically(writes, { failAfter: 1 })).toThrow(/simulated failure after 1 of 3/);
    expect(files.map((file) => readFileSync(file, 'utf8'))).toEqual(['original', 'original', 'original']);
    expect(readdirSync(root).sort()).toEqual(['a.json', 'b.json', 'c.json']);

    writeAtomically(writes);
    expect(files.map((file) => readFileSync(file, 'utf8'))).toEqual(['replacement', 'replacement', 'replacement']);
    expect(readdirSync(root).sort()).toEqual(['a.json', 'b.json', 'c.json']);
  });

  it('leaves nothing behind when a target did not exist yet', () => {
    const root = mkdtempSync(join(tmpdir(), 'wg-atomic-'));
    trash.push(() => rmSync(root, { recursive: true, force: true }));
    const files = three(root);
    writeFileSync(files[0]!, 'original');

    expect(() => writeAtomically(files.map((path) => ({ path, text: 'new' })), { failAfter: 2 })).toThrow();
    expect(readdirSync(root)).toEqual(['a.json']);
    expect(readFileSync(files[0]!, 'utf8')).toBe('original');
  });
});

describe('data:apply', () => {
  it('is a no-op on a clean tree', () => {
    const place = fixture();
    const before = ['countries.json', 'map.json'].map((name) => place.read(`data/build/${name}`));

    const result = applyOverrides({ root: place.root });

    expect(result.changed).toBe(false);
    expect(['countries.json', 'map.json'].map((name) => place.read(`data/build/${name}`))).toEqual(before);
    expect(result.report.join('\n')).toContain('already what the snapshots and overrides produce');
  });

  it('changes exactly one country after one capital is edited, with no network', () => {
    const place = fixture();
    const capitals = JSON.parse(place.read('data/overrides/capitals.json')) as {
      overrides: Record<string, string[]>;
    };
    capitals.overrides['NL'] = ['Haag'];
    place.write('data/overrides/capitals.json', `${JSON.stringify(capitals, null, 2)}\n`);

    // Proof rather than assertion: any fetch at all during the apply throws.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('data:apply reached the network');
    }) as typeof fetch;
    let result;
    try {
      result = applyOverrides({ root: place.root });
    } finally {
      globalThis.fetch = realFetch;
    }

    expect(result.changed).toBe(true);
    const after = JSON.parse(place.read('data/build/countries.json')) as Country[];
    const moved = diffCountries(baseline, after);
    expect(moved.added).toEqual([]);
    expect(moved.removed).toEqual([]);
    expect(moved.changed.map((change) => change.code)).toEqual(['NL']);
    expect(moved.changed[0]?.fields.map((field) => field.field)).toEqual(['capital']);
    expect(after.find((country) => country.code === 'NL')?.capital).toEqual(['Haag']);
    // The basemap is not the capitals' business.
    expect(place.read('data/build/map.json')).toBe(readFileSync(at('data/build/map.json'), 'utf8'));
  });

  it('re-decides a territorial call offline, from the pre-territory snapshot', () => {
    const place = fixture();
    const territory = JSON.parse(place.read('data/overrides/territory.json')) as {
      polygons: { reassign: { iso3: string; to: string; why: string }[] };
    };
    const kosovo = territory.polygons.reassign.find((rule) => rule.why.startsWith('Kosovo'))!;
    kosovo.to = 'SRB';
    place.write('data/overrides/territory.json', `${JSON.stringify(territory, null, 2)}\n`);

    applyOverrides({ root: place.root });

    const polygons = JSON.parse(place.read('data/build/map.json')) as MapPolygon[];
    expect(polygons.filter((polygon) => polygon.iso3 === UNATTRIBUTED)).toHaveLength(2);
    expect(polygons).toHaveLength(288);
  });

  it('reports what would change without writing, under --dry-run', () => {
    const place = fixture();
    const easy = JSON.parse(place.read('data/overrides/easy.json')) as { populationThreshold: number };
    easy.populationThreshold = 1_000_000;
    place.write('data/overrides/easy.json', `${JSON.stringify(easy, null, 2)}\n`);
    const before = place.read('data/build/countries.json');

    const result = applyOverrides({ root: place.root, dryRun: true });

    expect(result.changed).toBe(true);
    expect(result.report.join('\n')).toContain('would change; nothing written');
    expect(place.read('data/build/countries.json')).toBe(before);
  });
});

describe('the committed tree', () => {
  it('passes every invariant', () => {
    expect(failures(runChecks())).toEqual([]);
  });

  it('has snapshots that reproduce the dataset byte for byte', () => {
    // The same claim `data:check` makes, asserted here so a snapshot drifting
    // fails the suite and not only the command.
    expect(applyOverrides({ root: REPO, dryRun: true }).changed).toBe(false);
  });
});

// ------------------------------------------------------------------ helper

/** A `datasetChecks` input over the committed tree, for the perturbation tests. */
function datasetInput(countries: readonly Country[]): Parameters<typeof datasetChecks>[0] {
  const mapText = readFileSync(at('data/build/map.json'), 'utf8');
  return {
    countries,
    polygons: JSON.parse(mapText) as MapPolygon[],
    countriesText: serializeCountries(countries),
    mapText,
    overrides,
    flags: JSON.parse(readFileSync(at('data/build/flags.json'), 'utf8')) as Record<string, string>,
    hasFlagFile: () => true,
  };
}

/** Kept honest: `fetchPinned` is what every fetcher goes through. */
describe('content pinning', () => {
  it('reports a first sighting as new rather than failing', async () => {
    const place = fixture();
    const upstream = pin(place);
    const lock = loadLock(join(place.root, 'data/raw/sources.lock.json'));
    delete lock.remote['natural-earth'];
    const result = await fetchPinned('natural-earth', {
      lock,
      transport: upstream.transport,
      cacheDir: join(place.root, '.cache'),
      today: '2026-09-10',
    });
    expect(result.status).toBe('new');
    expect(result.pin.sha256).toBe(sha256(upstream.geo));
  });
});
