/**
 * The override layer: curation as configuration.
 *
 * `prepare_data.py` carried nine hand-maintained tables and four inline rules
 * in the middle of its fetch loop, so every territorial and capital-status call
 * the project makes — Crimea, Kosovo, Jerusalem, Western Sahara — was a Python
 * edit. They are editorial positions, not code, and they now live in
 * `data/overrides/` as JSON a maintainer edits directly. This module is the
 * only thing that reads them.
 *
 * Precedence is one-directional and shallow, and deliberately so:
 *
 *   override  >  fetched  >  missingUpstream
 *
 * An override key wins outright, and an override array *replaces* the fetched
 * array whole rather than merging into it — a hand-picked list of four official
 * languages must never grow an eleventh because upstream added one. The cost is
 * that an override goes stale silently, so every fetched value an override
 * suppressed is returned as a `ShadowedChange`: that list is the report U9
 * shows before it writes `data/build/`, and it is the only way a maintainer
 * learns that the thing they pinned has moved underneath them.
 *
 * `missingUpstream` is the other direction: a last-resort value for a country
 * the fetcher has no record of at all, which is how five countries reach the
 * dataset. A fetched value still beats it, and it shadows nothing.
 *
 * The merge builds `LocalizedCountry`, the bilingual record. `projectLocale`
 * narrows it back to the single-locale `Country` that `data/build/countries.json`
 * and the engine still use; U12 is what removes that step.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGIONS } from '../../src/engine/core.ts';
import type {
  Country,
  CurrencyCode,
  Iso2,
  Iso3,
  LangCode,
  Locale,
  LocaleBundle,
  LocalizedCountry,
  LocalizedText,
  Region,
} from '../../src/engine/types.ts';

/** Where the hand-edited layer lives. */
export const OVERRIDE_DIR = fileURLToPath(new URL('../../data/overrides', import.meta.url));

/** Natural Earth's "no code here" sentinel, and the value a polygon keeps when
 *  the game has no country to attribute it to. */
export const UNATTRIBUTED = '-99';

// ---------------------------------------------------------------- the layer

/** A `{lat, lon}` position in degrees, positive north and positive east. */
export interface Position {
  lat: number;
  lon: number;
}

/** `capitals.json`. Values under `overrides` are finished names; values under
 *  `missingUpstream` are upstream text and are translated like any other. */
export interface CapitalOverrides {
  overrides: Readonly<Record<string, readonly string[]>>;
  missingUpstream: Readonly<Record<string, readonly string[]>>;
}

/** `languages.json` and `currencies.json` — the same shape, both lists of codes. */
export interface ListOverrides {
  overrides: Readonly<Record<string, readonly string[]>>;
  missingUpstream: Readonly<Record<string, readonly string[]>>;
}

/** `regions.json`. `americasSouth` splits the one upstream `Americas` region. */
export interface RegionOverrides {
  americasSouth: readonly string[];
  overrides: Readonly<Record<string, string>>;
  missingUpstream: Readonly<Record<string, string>>;
}

/** `easy.json`. A country qualifies on the threshold or on the list. */
export interface EasyOverrides {
  populationThreshold: number;
  always: readonly string[];
}

/** `coords.json`. The globe marker denotes the country, not its capital. */
export interface CoordOverrides {
  overrides: Readonly<Record<string, Position>>;
  missingUpstream: Readonly<Record<string, Position>>;
}

/** One `territory.json` rule. `near` narrows `iso3` to a single polygon. */
export interface PolygonRule {
  iso3: string;
  near?: Position;
  why: string;
}

/** A `reassign` rule. `to` is `UNATTRIBUTED` where the game has no country. */
export interface ReassignRule extends PolygonRule {
  to: string;
}

/** `territory.json`. */
export interface TerritoryOverrides {
  polygons: {
    reassign: readonly ReassignRule[];
    drop: readonly PolygonRule[];
  };
}

/** The seven locale-neutral files, loaded. */
export interface OverrideBundle {
  capitals: CapitalOverrides;
  languages: ListOverrides;
  currencies: ListOverrides;
  regions: RegionOverrides;
  easy: EasyOverrides;
  coords: CoordOverrides;
  territory: TerritoryOverrides;
}

// ------------------------------------------------------------- what a fetch
// -------------------------------------------------------------- hands over

/** The locale-varying half of one upstream record. */
export interface FetchedText {
  /** Upstream country name — CLDR's territory name for the locale. */
  name: string;
  /** Capital names as *upstream* spells them; the locale bundle translates them. */
  capital: readonly string[];
  /** Upstream currency display names, by ISO 4217 code. */
  currencyNames: Readonly<Record<string, string>>;
  /** Upstream language display names, by tag. */
  languageNames: Readonly<Record<string, string>>;
}

/**
 * One upstream country record.
 *
 * Everything but the identity and the population is optional, because a fetch
 * legitimately comes back with holes: five countries have no upstream record at
 * all and reach the dataset through `missingUpstream` alone.
 */
export interface FetchedCountry {
  code: string;
  iso3: string;
  currency?: readonly string[];
  languages?: readonly string[];
  /** The wider set the distractor filter excludes; the final languages join it. */
  excludeLanguages?: readonly string[];
  lat?: number;
  lon?: number;
  /** Upstream's own region name, which is one `Americas` rather than two. */
  region?: string;
  population: number;
  populationYear: number;
  populationKind: string;
  populationSource: string;
  text: Readonly<Partial<Record<Locale, FetchedText>>>;
}

/** One fetched value an override suppressed. U9 reports these before writing. */
export interface ShadowedChange {
  /** ISO 3166-1 alpha-2, the code the entry is filed under. */
  code: string;
  /** Which file forced the value, so a maintainer knows what to edit. */
  source: string;
  /** The `Country` field it lands in. */
  field: string;
  /** What the fetch said, and the override discarded. */
  fetched: unknown;
  /** What the override said instead. */
  override: unknown;
}

export interface MergeInput<L extends Locale> {
  fetched: readonly FetchedCountry[];
  overrides: OverrideBundle;
  /** One per locale carried. The first is the locale the dataset is ordered by. */
  bundles: readonly [LocaleBundle<L>, ...LocaleBundle<L>[]];
}

export interface MergeResult<L extends Locale> {
  countries: LocalizedCountry<L>[];
  shadowed: ShadowedChange[];
}

// ------------------------------------------------------------------ loading

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;

function asRecord(value: unknown, path: string, key: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path}: \`${key}\` must be an object`);
  }
  return value as Record<string, unknown>;
}

function field(root: Record<string, unknown>, path: string, key: string): unknown {
  if (!(key in root)) throw new Error(`${path}: missing \`${key}\``);
  return root[key];
}

/**
 * Reads one file and hands back its top-level object.
 *
 * `why` is required rather than conventional. JSON cannot hold a comment, and
 * every one of these files is a position someone took — so a file that does not
 * say what it is for has already lost the only thing that made it reviewable.
 */
function readOverrideFile(dir: string, name: string): [Record<string, unknown>, string] {
  const path = join(dir, name);
  const root = asRecord(readJson(path), path, name);
  if (typeof root['why'] !== 'string' || root['why'] === '') {
    throw new Error(`${path}: needs a \`why\` saying what the file decides`);
  }
  return [root, path];
}

function stringListMap(
  root: Record<string, unknown>,
  path: string,
  key: string,
): Record<string, readonly string[]> {
  const raw = asRecord(field(root, path, key), path, key);
  const out: Record<string, readonly string[]> = {};
  for (const [code, value] of Object.entries(raw)) {
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
      throw new Error(`${path}: \`${key}.${code}\` must be a list of strings`);
    }
    if (value.length === 0) throw new Error(`${path}: \`${key}.${code}\` is empty`);
    out[code] = value as string[];
  }
  return out;
}

function stringMap(root: Record<string, unknown>, path: string, key: string): Record<string, string> {
  const raw = asRecord(field(root, path, key), path, key);
  const out: Record<string, string> = {};
  for (const [code, value] of Object.entries(raw)) {
    if (typeof value !== 'string') throw new Error(`${path}: \`${key}.${code}\` must be a string`);
    out[code] = value;
  }
  return out;
}

function positionMap(root: Record<string, unknown>, path: string, key: string): Record<string, Position> {
  const raw = asRecord(field(root, path, key), path, key);
  const out: Record<string, Position> = {};
  for (const [code, value] of Object.entries(raw)) {
    const point = asRecord(value, path, `${key}.${code}`);
    const { lat, lon } = point;
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      throw new Error(`${path}: \`${key}.${code}\` must be { lat, lon } in degrees`);
    }
    out[code] = { lat, lon };
  }
  return out;
}

function polygonRule(value: unknown, path: string, where: string, needsTo: boolean): ReassignRule {
  const raw = asRecord(value, path, where);
  const { iso3, near, to, why } = raw;
  if (typeof iso3 !== 'string') throw new Error(`${path}: \`${where}.iso3\` must be a string`);
  if (typeof why !== 'string' || why === '') {
    // A territorial call with no stated reason is the one thing this layer
    // exists to prevent, so an empty `why` is a hard error rather than a lint.
    throw new Error(`${path}: \`${where}\` needs a \`why\` saying whose call this is`);
  }
  if (needsTo && typeof to !== 'string') throw new Error(`${path}: \`${where}.to\` must be a string`);
  const rule: ReassignRule = { iso3, to: needsTo ? (to as string) : '', why };
  if (near !== undefined) {
    const point = asRecord(near, path, `${where}.near`);
    if (typeof point['lat'] !== 'number' || typeof point['lon'] !== 'number') {
      throw new Error(`${path}: \`${where}.near\` must be { lat, lon } in degrees`);
    }
    rule.near = { lat: point['lat'], lon: point['lon'] };
  }
  return rule;
}

/** Loads the seven locale-neutral files. Throws naming the file on a bad shape. */
export function loadOverrides(dir: string = OVERRIDE_DIR): OverrideBundle {
  const [capitals, capitalsPath] = readOverrideFile(dir, 'capitals.json');
  const [languages, languagesPath] = readOverrideFile(dir, 'languages.json');
  const [currencies, currenciesPath] = readOverrideFile(dir, 'currencies.json');
  const [regions, regionsPath] = readOverrideFile(dir, 'regions.json');
  const [easy, easyPath] = readOverrideFile(dir, 'easy.json');
  const [coords, coordsPath] = readOverrideFile(dir, 'coords.json');
  const [territory, territoryPath] = readOverrideFile(dir, 'territory.json');

  const threshold = field(easy, easyPath, 'populationThreshold');
  if (typeof threshold !== 'number') throw new Error(`${easyPath}: \`populationThreshold\` must be a number`);
  const always = field(easy, easyPath, 'always');
  if (!Array.isArray(always) || always.some((v) => typeof v !== 'string')) {
    throw new Error(`${easyPath}: \`always\` must be a list of country codes`);
  }
  const americasSouth = field(regions, regionsPath, 'americasSouth');
  if (!Array.isArray(americasSouth) || americasSouth.some((v) => typeof v !== 'string')) {
    throw new Error(`${regionsPath}: \`americasSouth\` must be a list of country codes`);
  }

  const polygons = asRecord(field(territory, territoryPath, 'polygons'), territoryPath, 'polygons');
  const reassignRaw = field(polygons, territoryPath, 'reassign');
  const dropRaw = field(polygons, territoryPath, 'drop');
  if (!Array.isArray(reassignRaw) || !Array.isArray(dropRaw)) {
    throw new Error(`${territoryPath}: \`polygons.reassign\` and \`polygons.drop\` must be lists`);
  }

  return {
    capitals: {
      overrides: stringListMap(capitals, capitalsPath, 'overrides'),
      missingUpstream: stringListMap(capitals, capitalsPath, 'missingUpstream'),
    },
    languages: {
      overrides: stringListMap(languages, languagesPath, 'overrides'),
      missingUpstream: stringListMap(languages, languagesPath, 'missingUpstream'),
    },
    currencies: {
      overrides: stringListMap(currencies, currenciesPath, 'overrides'),
      missingUpstream: stringListMap(currencies, currenciesPath, 'missingUpstream'),
    },
    regions: {
      americasSouth: americasSouth as string[],
      overrides: stringMap(regions, regionsPath, 'overrides'),
      missingUpstream: stringMap(regions, regionsPath, 'missingUpstream'),
    },
    easy: { populationThreshold: threshold, always: always as string[] },
    coords: {
      overrides: positionMap(coords, coordsPath, 'overrides'),
      missingUpstream: positionMap(coords, coordsPath, 'missingUpstream'),
    },
    territory: {
      polygons: {
        reassign: reassignRaw.map((rule, i) =>
          polygonRule(rule, territoryPath, `polygons.reassign[${i}]`, true),
        ),
        drop: dropRaw.map((rule, i) => polygonRule(rule, territoryPath, `polygons.drop[${i}]`, false)),
      },
    },
  };
}

/** Loads `countries.<locale>.json` and `notes.<locale>.json` as one bundle. */
export function loadLocaleBundle<L extends Locale>(locale: L, dir: string = OVERRIDE_DIR): LocaleBundle<L> {
  const [text, textPath] = readOverrideFile(dir, `countries.${locale}.json`);
  const [notes, notesPath] = readOverrideFile(dir, `notes.${locale}.json`);
  return {
    locale,
    names: stringMap(text, textPath, 'names'),
    capitals: stringMap(text, textPath, 'capitals'),
    currencies: stringMap(text, textPath, 'currencies'),
    languages: stringMap(text, textPath, 'languages'),
    notes: stringMap(notes, notesPath, 'notes'),
  };
}

// -------------------------------------------------------------- the merge

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Rejects a country code no fetch produced.
 *
 * A code that matches nothing is the failure mode this layer invites: a
 * maintainer files a note under `UK`, nothing breaks, and the note is simply
 * never shown. It has to be loud.
 */
function checkCodes(known: ReadonlySet<string>, entries: readonly [string, string, Iterable<string>][]): void {
  for (const [source, key, codes] of entries) {
    for (const code of codes) {
      if (!known.has(code)) {
        throw new Error(`${source}: \`${key}\` has an entry for unknown country code "${code}"`);
      }
    }
  }
}

/** Every locale's text for one field, built from a per-locale resolver. */
function localized<L extends Locale>(
  bundles: readonly LocaleBundle<L>[],
  resolve: (bundle: LocaleBundle<L>) => string,
): LocalizedText<L> {
  const out = {} as Record<L, string>;
  for (const bundle of bundles) out[bundle.locale] = resolve(bundle);
  return out;
}

/**
 * Applies the layer to a fetch.
 *
 * The derivation order mirrors `prepare_data.py` exactly, because the committed
 * baseline is the oracle: capitals, then currencies and their names, then
 * languages and theirs, then the excluded set, then the position, then the
 * region split, then the easy rule, and finally the sort by name in the leading
 * locale — which is a code-point sort in both languages, so it agrees with the
 * Python one.
 */
export function mergeCountries<L extends Locale>(input: MergeInput<L>): MergeResult<L> {
  const { fetched, overrides, bundles } = input;
  const base = bundles[0];
  const known = new Set(fetched.map((c) => c.code));
  const shadowed: ShadowedChange[] = [];

  checkCodes(known, [
    ['capitals.json', 'overrides', Object.keys(overrides.capitals.overrides)],
    ['capitals.json', 'missingUpstream', Object.keys(overrides.capitals.missingUpstream)],
    ['languages.json', 'overrides', Object.keys(overrides.languages.overrides)],
    ['languages.json', 'missingUpstream', Object.keys(overrides.languages.missingUpstream)],
    ['currencies.json', 'overrides', Object.keys(overrides.currencies.overrides)],
    ['currencies.json', 'missingUpstream', Object.keys(overrides.currencies.missingUpstream)],
    ['regions.json', 'americasSouth', overrides.regions.americasSouth],
    ['regions.json', 'overrides', Object.keys(overrides.regions.overrides)],
    ['regions.json', 'missingUpstream', Object.keys(overrides.regions.missingUpstream)],
    ['easy.json', 'always', overrides.easy.always],
    ['coords.json', 'overrides', Object.keys(overrides.coords.overrides)],
    ['coords.json', 'missingUpstream', Object.keys(overrides.coords.missingUpstream)],
    ...bundles.map(
      (bundle): [string, string, Iterable<string>] => [
        `countries.${bundle.locale}.json`,
        'names',
        Object.keys(bundle.names),
      ],
    ),
    ...bundles.map(
      (bundle): [string, string, Iterable<string>] => [
        `notes.${bundle.locale}.json`,
        'notes',
        Object.keys(bundle.notes),
      ],
    ),
  ]);

  const countries: LocalizedCountry<L>[] = [];

  for (const country of fetched) {
    const code = country.code;
    const shadow = (source: string, field: string, was: unknown, now: unknown): void => {
      if (!same(was, now)) shadowed.push({ code, source, field, fetched: was, override: now });
    };
    const textFor = (bundle: LocaleBundle<L>): FetchedText => {
      const text = country.text[bundle.locale];
      if (text === undefined) throw new Error(`${code}: the fetch carries no ${bundle.locale} text`);
      return text;
    };

    // --- name ---------------------------------------------------------
    const name = localized(bundles, (bundle) => bundle.names[code] ?? textFor(bundle).name);
    for (const bundle of bundles) {
      if (bundle.names[code] !== undefined) {
        shadow(`countries.${bundle.locale}.json`, 'name', textFor(bundle).name, bundle.names[code]);
      }
    }

    // --- capital ------------------------------------------------------
    // A pinned list is a finished name and skips the translation table; only a
    // fetched capital passes through it, which is what `prepare_data.py` did.
    const pinnedCapital = overrides.capitals.overrides[code];
    const upstreamCapital = (bundle: LocaleBundle<L>): string[] => {
      const fetchedCapital = textFor(bundle).capital;
      const source = fetchedCapital.length > 0 ? fetchedCapital : overrides.capitals.missingUpstream[code] ?? [];
      return source.map((city) => bundle.capitals[city] ?? city);
    };
    let capital: LocalizedText<L>[];
    if (pinnedCapital !== undefined) {
      shadow('capitals.json', 'capital', upstreamCapital(base), pinnedCapital);
      capital = pinnedCapital.map((city) => localized(bundles, () => city));
    } else {
      const perLocale = new Map(bundles.map((bundle) => [bundle.locale, upstreamCapital(bundle)]));
      const width = perLocale.get(base.locale)?.length ?? 0;
      for (const [locale, list] of perLocale) {
        if (list.length !== width) {
          throw new Error(
            `${code}: the fetch gives ${width} capitals in ${base.locale} but ${list.length} in ${locale}`,
          );
        }
      }
      capital = Array.from({ length: width }, (_unused, i) =>
        localized(bundles, (bundle) => perLocale.get(bundle.locale)?.[i] ?? ''),
      );
    }
    if (capital.length === 0) throw new Error(`${code}: no capital, and none supplied by hand`);

    // --- currency and its names --------------------------------------
    const pinnedCurrency = overrides.currencies.overrides[code];
    if (pinnedCurrency !== undefined && country.currency !== undefined) {
      shadow('currencies.json', 'currency', country.currency, pinnedCurrency);
    }
    const currency =
      pinnedCurrency ??
      (country.currency !== undefined && country.currency.length > 0
        ? country.currency
        : overrides.currencies.missingUpstream[code]);
    if (currency === undefined || currency.length === 0) {
      throw new Error(`${code}: no currency, and none supplied by hand`);
    }
    const currencyNames = currency.map((unit) => {
      for (const bundle of bundles) {
        const pinned = bundle.currencies[unit];
        if (pinned !== undefined) {
          shadow(`countries.${bundle.locale}.json`, 'currencyNames', textFor(bundle).currencyNames[unit], pinned);
        }
      }
      return {
        code: unit as CurrencyCode,
        name: localized(bundles, (bundle) => bundle.currencies[unit] ?? textFor(bundle).currencyNames[unit] ?? unit),
      };
    });

    // --- languages and their names -----------------------------------
    const pinnedLanguages = overrides.languages.overrides[code];
    if (pinnedLanguages !== undefined && country.languages !== undefined) {
      shadow('languages.json', 'languages', country.languages, pinnedLanguages);
    }
    const languages =
      pinnedLanguages ??
      (country.languages !== undefined && country.languages.length > 0
        ? country.languages
        : overrides.languages.missingUpstream[code]);
    if (languages === undefined || languages.length === 0) {
      throw new Error(`${code}: no languages, and none supplied by hand`);
    }
    const languageNames = languages.map((tag) => {
      for (const bundle of bundles) {
        const pinned = bundle.languages[tag];
        if (pinned !== undefined) {
          shadow(`countries.${bundle.locale}.json`, 'languageNames', textFor(bundle).languageNames[tag], pinned);
        }
      }
      return localized(bundles, (bundle) => bundle.languages[tag] ?? textFor(bundle).languageNames[tag] ?? tag);
    });

    // The distractor filter excludes more than the question offers: the final
    // languages joined with every other language upstream reports for the
    // territory. Sorted, because `prepare_data.py` sorted it and the fixtures
    // record the order.
    const excludeLanguages = [...new Set([...languages, ...(country.excludeLanguages ?? [])])].sort();

    // --- position -----------------------------------------------------
    const pinnedPosition = overrides.coords.overrides[code];
    if (pinnedPosition !== undefined && country.lat !== undefined && country.lon !== undefined) {
      shadow('coords.json', 'lat/lon', { lat: country.lat, lon: country.lon }, pinnedPosition);
    }
    const position =
      pinnedPosition ??
      (country.lat !== undefined && country.lon !== undefined
        ? { lat: country.lat, lon: country.lon }
        : overrides.coords.missingUpstream[code]);
    if (position === undefined) throw new Error(`${code}: no position, and none supplied by hand`);

    // --- region -------------------------------------------------------
    const upstreamRegion = country.region ?? overrides.regions.missingUpstream[code];
    if (upstreamRegion === undefined) throw new Error(`${code}: no region, and none supplied by hand`);
    const split =
      upstreamRegion === 'Americas'
        ? overrides.regions.americasSouth.includes(code)
          ? 'South America'
          : 'North America'
        : upstreamRegion;
    const pinnedRegion = overrides.regions.overrides[code];
    if (pinnedRegion !== undefined) shadow('regions.json', 'region', split, pinnedRegion);
    const region = pinnedRegion ?? split;
    if (!(region in REGIONS)) throw new Error(`${code}: "${region}" is not one of the six playable regions`);

    countries.push({
      code: code as Iso2,
      iso3: country.iso3 as Iso3,
      name,
      capital,
      currency: currency as CurrencyCode[],
      currencyNames,
      languages: languages as LangCode[],
      languageNames,
      excludeLanguages: excludeLanguages as LangCode[],
      lat: position.lat,
      lon: position.lon,
      region: region as Region,
      population: country.population,
      populationYear: country.populationYear,
      populationKind: country.populationKind,
      populationSource: country.populationSource,
      note: localized(bundles, (bundle) => bundle.notes[code] ?? ''),
      easy: country.population > overrides.easy.populationThreshold || overrides.easy.always.includes(code),
    });
  }

  countries.sort((a, b) => (a.name[base.locale] < b.name[base.locale] ? -1 : a.name[base.locale] > b.name[base.locale] ? 1 : 0));
  shadowed.sort((a, b) => `${a.code}${a.source}${a.field}`.localeCompare(`${b.code}${b.source}${b.field}`, 'en'));
  return { countries, shadowed };
}

/** The single-locale `Country` the engine and `data/build/` still read. U12 removes this. */
export function projectLocale<L extends Locale>(
  countries: readonly LocalizedCountry<L>[],
  locale: L,
): Country[] {
  return countries.map((c) => ({
    code: c.code,
    iso3: c.iso3,
    name: c.name[locale],
    capital: c.capital.map((city) => city[locale]),
    currency: c.currency,
    currencyNames: c.currencyNames.map((unit) => ({ code: unit.code, name: unit.name[locale] })),
    languages: c.languages,
    languageNames: c.languageNames.map((tag) => tag[locale]),
    excludeLanguages: c.excludeLanguages,
    lat: c.lat,
    lon: c.lon,
    region: c.region,
    population: c.population,
    populationYear: c.populationYear,
    populationKind: c.populationKind,
    populationSource: c.populationSource,
    note: c.note[locale],
    easy: c.easy,
  }));
}

// ----------------------------------------------------------- the basemap

/** One landmass ring of `map.json`, as `[lon, lat]` pairs in degrees. */
export interface MapPolygon {
  iso3: string;
  points: readonly (readonly [number, number])[];
}

const describeRule = (kind: 'reassign' | 'drop', index: number, rule: ReassignRule): string => {
  const near = rule.near === undefined ? '' : ` near ${rule.near.lat}, ${rule.near.lon}`;
  const to = kind === 'reassign' ? ` → "${rule.to}"` : '';
  return `territory.json polygons.${kind}[${index}] (iso3 "${rule.iso3}"${near}${to})`;
};

/** True when `point` falls inside the polygon's bounding box. */
function encloses(polygon: MapPolygon, point: Position): boolean {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const [lon, lat] of polygon.points) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return point.lon >= west && point.lon <= east && point.lat >= south && point.lat <= north;
}

function selectOne(
  polygons: readonly MapPolygon[],
  live: ReadonlySet<number>,
  rule: ReassignRule,
  label: string,
): number {
  const hits: number[] = [];
  for (let i = 0; i < polygons.length; i += 1) {
    const polygon = polygons[i];
    if (polygon === undefined || !live.has(i) || polygon.iso3 !== rule.iso3) continue;
    if (rule.near !== undefined && !encloses(polygon, rule.near)) continue;
    hits.push(i);
  }
  if (hits.length === 0) {
    throw new Error(
      `${label} matched no polygon. Upstream renamed, merged or dropped the landmass; ` +
        `check the rule before deleting it. Why it exists: ${rule.why}`,
    );
  }
  if (hits.length > 1) {
    throw new Error(
      `${label} matched ${hits.length} polygons and has to match exactly one. ` +
        `Narrow it with a \`near\` point inside the one you mean, or split it into ${hits.length} rules.`,
    );
  }
  return hits[0]!; // length === 1 was just established
}

/**
 * Applies `territory.json` to a fetched basemap.
 *
 * Every rule is resolved against the same input rather than against the running
 * result, so the file's order carries no meaning and a maintainer can sort it
 * however they like. Drops are resolved first and take a polygon out of reach of
 * the reassign rules, which is why a reassign rule aimed at a dropped polygon
 * fails loudly instead of silently doing nothing.
 */
export function applyTerritory(
  polygons: readonly MapPolygon[],
  territory: TerritoryOverrides,
): MapPolygon[] {
  const live = new Set(polygons.map((_unused, i) => i));
  const dropped = new Set<number>();

  territory.polygons.drop.forEach((rule, i) => {
    dropped.add(selectOne(polygons, live, { ...rule, to: '' }, describeRule('drop', i, { ...rule, to: '' })));
  });
  for (const index of dropped) live.delete(index);

  const claimed = new Map<number, number>();
  const assignments = territory.polygons.reassign.map((rule, i) => {
    const index = selectOne(polygons, live, rule, describeRule('reassign', i, rule));
    const earlier = claimed.get(index);
    if (earlier !== undefined) {
      throw new Error(
        `${describeRule('reassign', i, rule)} and ${describeRule(
          'reassign',
          earlier,
          territory.polygons.reassign[earlier]!,
        )} both matched the same polygon.`,
      );
    }
    claimed.set(index, i);
    return [index, rule.to] as const;
  });

  const result = polygons
    .map((polygon, i): [number, MapPolygon] => [i, { iso3: polygon.iso3, points: polygon.points }])
    .filter(([i]) => !dropped.has(i));
  const byIndex = new Map(result);
  for (const [index, to] of assignments) byIndex.get(index)!.iso3 = to; // `live` excluded the dropped
  return result.map(([, polygon]) => polygon);
}
