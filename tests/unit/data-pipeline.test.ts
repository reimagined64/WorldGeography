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
 */
function fixture(options: { notices?: 'current' | 'v7' } = {}): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'wg-data-'));
  trash.push(() => rmSync(root, { recursive: true, force: true }));
  for (const dir of ['data/overrides', 'data/raw', 'data/build']) {
    cpSync(at(dir), join(root, dir), { recursive: true });
  }
  mkdirSync(join(root, 'licenses'), { recursive: true });
  copyFileSync(at('licenses/ODbL-1.0.txt'), join(root, 'licenses/ODbL-1.0.txt'));
  mkdirSync(join(root, 'assets/flags'), { recursive: true });
  for (const country of baseline) writeFileSync(join(root, 'assets/flags', `${country.code}.png`), '');

  // The frozen v7 notices still credit Worldometer, CountryInfo, Babel and the
  // pyogrio fixture. Seeding them is how the provenance rewrite gets something
  // real to rewrite.
  if (options.notices === 'v7') {
    copyFileSync(at('tests/fixtures/baseline/embedded-notices.txt'), join(root, 'data/embedded-notices.txt'));
    copyFileSync(at('tests/fixtures/baseline/data/sources.json'), join(root, 'data/build/sources.json'));
  } else {
    copyFileSync(at('data/embedded-notices.txt'), join(root, 'data/embedded-notices.txt'));
  }

  return {
    root,
    read: (relative) => readFileSync(join(root, relative), 'utf8'),
    write: (relative, text) => writeFileSync(join(root, relative), text),
  };
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

  it('fails on a polygon nobody decided to leave unattributed', () => {
    const polygons = JSON.parse(readFileSync(at('data/build/map.json'), 'utf8')) as MapPolygon[];
    const orphaned = polygons.map((polygon, i) => (i === 0 ? { ...polygon, iso3: UNATTRIBUTED } : polygon));
    const results = datasetChecks({ ...datasetInput(baseline), polygons: orphaned });
    expect(failures(results)).toContain('every -99 polygon was decided');
  });

  it('fails on an integral float in a coordinate', () => {
    const text = serializeCountries(baseline).replace('"lat": 33,', '"lat": 33.0,');
    expect(failures(datasetChecks({ ...datasetInput(baseline), countriesText: text }))).toContain('numeric shape');
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

  it('fails when the notices still credit a source no fetcher reads', () => {
    const place = fixture({ notices: 'v7' });
    const result = runChecks(place.root).find((check) => check.name === 'no retired sources credited');
    expect(result?.ok).toBe(false);
    for (const needle of ['worldometer', 'countryinfo', 'babel', 'pyogrio']) {
      expect(result?.detail.toLowerCase()).toContain(needle);
    }
  });

  it('fails when the ODbL text is not shipped beside the game', () => {
    const place = fixture();
    rmSync(join(place.root, 'licenses/ODbL-1.0.txt'));
    expect(failures(runChecks(place.root))).toContain('ODbL text ships');
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
    const place = fixture({ notices: 'v7' });
    const upstream = pin(place);
    const before = place.read('data/build/countries.json');

    const result = await run(place, upstream, { accept: true });

    expect(result.accepted).toBe(true);
    expect(result.writes.map((write) => write.path.slice(place.root.length + 1)).sort()).toEqual([
      'data/build/countries.json',
      'data/build/map.json',
      'data/build/sources.json',
      'data/embedded-notices.txt',
      'data/raw/countries.json',
      'data/raw/map.json',
      'data/raw/sources.lock.json',
    ]);
    expect(place.read('data/build/countries.json')).not.toBe(before);
    // No leftovers from the staging step.
    expect(readdirSync(join(place.root, 'data/build')).sort()).toEqual([
      'countries.json', 'flags.json', 'map.json', 'sources.json',
    ]);
    expect(failures(runChecks(place.root))).toEqual([]);
  });

  it('stops crediting Worldometer, CountryInfo, Babel and pyogrio', async () => {
    const place = fixture({ notices: 'v7' });
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
