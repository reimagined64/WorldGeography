/**
 * U8 — the override layer, checked against the script it was extracted from.
 *
 * Two oracles, and neither is this file's own opinion. The transcription is
 * checked against `docs/provenance/original-python/prepare_data.py.txt` by
 * parsing the Python literals out of it, so a mistyped exonym fails here rather
 * than surfacing as a wrong answer in a game. The merge is checked against
 * `data/build/countries.json`: applying the whole layer to the committed
 * baseline has to give the baseline back, byte for byte.
 *
 * The second gate is the real one, and it only means something if it can fail,
 * so `perturbing an override` proves it does.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  applyTerritory,
  loadLocaleBundle,
  loadOverrides,
  mergeCountries,
  projectLocale,
  UNATTRIBUTED,
  type FetchedCountry,
  type MapPolygon,
  type OverrideBundle,
  type TerritoryOverrides,
} from '../../scripts/data/merge.ts';
import type { Country, LocaleBundle } from '../../src/engine/types.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path: string) => readFileSync(new URL(path, `file://${root}`), 'utf8');

const overrideDir = new URL('data/overrides/', `file://${root}`);
const overrideJson = (name: string) => JSON.parse(read(`data/overrides/${name}`)) as Record<string, never>;

const baselineText = read('data/build/countries.json');
const baseline = JSON.parse(baselineText) as Country[];
const baselineMap = JSON.parse(read('data/build/map.json')) as MapPolygon[];

// ------------------------------------------------------------- the archive

/**
 * Reads one Python literal out of the archived script.
 *
 * A real parser rather than a regular expression because the tables carry
 * escaped apostrophes and `\u` escapes — `Nukuʻalofa` and `N’Djamena`
 * are two of the entries most likely to be transcribed wrong, so they are
 * exactly the ones the oracle has to read correctly.
 */
function pythonLiteral(source: string, name: string): unknown {
  const at = source.indexOf(`\n${name}=`);
  if (at < 0) throw new Error(`prepare_data.py has no table named ${name}`);
  return readValue(source, at + name.length + 2)[0];
}

function readValue(src: string, from: number): [unknown, number] {
  let i = from;
  const skip = (): void => {
    while (i < src.length) {
      if (src[i] === '#') while (i < src.length && src[i] !== '\n') i += 1;
      else if (/\s/.test(src[i]!)) i += 1;
      else break;
    }
  };
  skip();
  const open = src[i];

  if (open === '{' || open === '[') {
    const close = open === '{' ? '}' : ']';
    const list: unknown[] = [];
    const map: Record<string, unknown> = {};
    i += 1;
    for (;;) {
      skip();
      if (src[i] === close) return [open === '{' ? map : list, i + 1];
      const [key, afterKey] = readValue(src, i);
      i = afterKey;
      skip();
      if (open === '{') {
        if (src[i] !== ':') throw new Error(`expected ":" at ${i}`);
        const [value, afterValue] = readValue(src, i + 1);
        map[String(key)] = value;
        i = afterValue;
      } else {
        list.push(key);
      }
      skip();
      if (src[i] === ',') i += 1;
    }
  }

  if (open === "'" || open === '"') {
    let out = '';
    i += 1;
    while (src[i] !== open) {
      if (src[i] === '\\') {
        const escape = src[i + 1]!;
        if (escape === 'u') {
          out += String.fromCharCode(Number.parseInt(src.slice(i + 2, i + 6), 16));
          i += 6;
        } else {
          out += { n: '\n', t: '\t', r: '\r' }[escape] ?? escape;
          i += 2;
        }
      } else {
        out += src[i];
        i += 1;
      }
    }
    return [out, i + 1];
  }

  const number = /^-?\d+(\.\d+)?/.exec(src.slice(i));
  if (number === null) throw new Error(`cannot read a value at ${i}: ${src.slice(i, i + 40)}`);
  return [Number(number[0]), i + number[0].length];
}

const archive = read('docs/provenance/original-python/prepare_data.py.txt');
const table = (name: string) => pythonLiteral(archive, name) as Record<string, never>;
const pythonWords = (pattern: RegExp): string[] => {
  const found = pattern.exec(archive);
  if (found === null) throw new Error(`prepare_data.py no longer contains ${String(pattern)}`);
  return found[1]!.split(' ');
};

// ------------------------------------------------------------ the fixtures

const overrides = loadOverrides();
const cs = loadLocaleBundle('cs');

/** The baseline read back as if a fetch had just produced it. */
const fetchFromBaseline = (country: Country): FetchedCountry => ({
  code: country.code,
  iso3: country.iso3,
  currency: country.currency,
  languages: country.languages,
  excludeLanguages: country.excludeLanguages,
  lat: country.lat,
  lon: country.lon,
  region: country.region,
  population: country.population,
  populationYear: country.populationYear,
  populationKind: country.populationKind,
  populationSource: country.populationSource,
  text: {
    cs: {
      name: country.name,
      capital: country.capital,
      currencyNames: Object.fromEntries(country.currencyNames.map((unit) => [unit.code, unit.name])),
      languageNames: Object.fromEntries(country.languages.map((tag, i) => [tag, country.languageNames[i]!])),
    },
  },
});

const mergeBaseline = (
  layer: OverrideBundle = overrides,
  bundle: LocaleBundle<'cs'> = cs,
  fetched = baseline.map(fetchFromBaseline),
) => mergeCountries({ fetched, overrides: layer, bundles: [bundle] });

const serialize = (countries: Country[]) => `${JSON.stringify(countries, null, 2)}\n`;

/** A structural clone, so a test can perturb one value without leaking into the next. */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// ------------------------------------------------------------------ tests

describe('transcription from prepare_data.py', () => {
  it('files the layer under the nine names, and scaffolds no locale it cannot fill', () => {
    // `countries.en.json` and `notes.en.json` are U12's and U17's; an empty one
    // here would read as a locale the dataset carries and does not.
    expect(readdirSync(overrideDir).sort()).toEqual([
      'capitals.json',
      'coords.json',
      'countries.cs.json',
      'currencies.json',
      'easy.json',
      'languages.json',
      'notes.cs.json',
      'regions.json',
      'territory.json',
    ]);
  });

  it('carries cap_overrides — 29 entries, exactly as the script had them', () => {
    const original = table('cap_overrides');
    expect(Object.keys(original)).toHaveLength(29);
    expect(overrides.capitals.overrides).toEqual(original);
  });

  it('carries capital_names — 101 exonyms, escapes and all', () => {
    const original = table('capital_names');
    expect(Object.keys(original)).toHaveLength(101);
    expect(cs.capitals).toEqual(original);
    // The three spellings of the Tongan capital and the two of the Chadian one
    // are the entries a hand transcription loses.
    expect(cs.capitals['Nukuʻalofa']).toBe('Nukuʻalofa');
    expect(cs.capitals["Nuku'alofa"]).toBe('Nukuʻalofa');
    expect(cs.capitals['N’Djamena']).toBe('N’Djamena');
  });

  it('carries notes — 22 entries, one of them deliberately rewritten', () => {
    const original = table('notes');
    const notes = overrideJson('notes.cs.json')['notes'] as unknown as Record<string, string>;
    expect(Object.keys(original)).toHaveLength(22);
    expect(Object.keys(notes).sort()).toEqual(Object.keys(original).sort());

    // Every note is the script's, except Togo's. Its note named the Worldometer
    // table the number was transcribed from, and after the WPP substitution the
    // number is read from the UN CSV directly — so the note said something
    // about the dataset that had stopped being true.
    for (const [code, text] of Object.entries(original)) {
      if (code === 'TG') continue;
      expect(notes[code]).toBe(text);
    }
    expect(notes['TG']).not.toBe((original as unknown as Record<string, string>)['TG']);
    expect(notes['TG']).toContain('OSN WPP 2024');
    expect(notes['TG']?.toLowerCase()).not.toContain('worldometer');
  });

  it('carries lang_overrides — the script\'s 85 entries, in the order a player reads', () => {
    const original = table('lang_overrides');
    expect(Object.keys(original)).toHaveLength(85);
    // Every entry the script had, unchanged. The layer may hold more than the
    // script did; it may not hold one of these differently.
    for (const [code, value] of Object.entries(original)) {
      expect(overrides.languages.overrides[code]).toEqual(value);
    }
    expect(overrides.languages.overrides['ZA']).toEqual([
      'zu', 'xh', 'af', 'en', 'st', 'tn', 'ts', 'ss', 've', 'nr', 'nso',
    ]);
  });

  it('carries currency_overrides — the script\'s 18 entries', () => {
    const original = table('currency_overrides');
    expect(Object.keys(original)).toHaveLength(18);
    for (const [code, value] of Object.entries(original)) {
      expect(overrides.currencies.overrides[code]).toEqual(value);
    }
  });

  it('pins the rest against upstream drift, with the shipped dataset as the oracle', () => {
    // These are not transcriptions — `prepare_data.py` never needed them,
    // because Babel and CountryInfo agreed with its choices. `world-countries`
    // does not: it makes Bavarian the language of Austria, adds French to
    // Lebanon and English to Malaysia, offers Belize Kriol and Upper Guinea
    // Crioulo where CLDR has no Czech name at all, and invents currency codes
    // for Kiribati and Tuvalu that no locale can render. Their oracle is the
    // dataset that ships, so this asserts exactly that and nothing about taste.
    const byCode = new Map(baseline.map((country) => [country.code as string, country]));
    const added = (layer: Readonly<Record<string, readonly string[]>>, script: string) =>
      Object.keys(layer).filter((code) => !(code in table(script)));

    const languages = added(overrides.languages.overrides, 'lang_overrides');
    expect(languages).toEqual([
      'AR', 'AT', 'BZ', 'CD', 'CF', 'CG', 'CM', 'DJ', 'EC', 'GW', 'JM', 'KE', 'LB',
      'LI', 'LS', 'MY', 'NO', 'SN', 'SO', 'TN', 'TO', 'TZ', 'UG',
    ]);
    for (const code of languages) {
      expect(overrides.languages.overrides[code]).toEqual(byCode.get(code)?.languages);
    }

    const currencies = added(overrides.currencies.overrides, 'currency_overrides');
    expect(currencies).toEqual(['BN', 'BS', 'HT', 'KH', 'KI', 'TV']);
    for (const code of currencies) {
      expect(overrides.currencies.overrides[code]).toEqual(byCode.get(code)?.currency);
    }
  });

  it('carries lang_names — 14 entries', () => {
    const original = table('lang_names');
    expect(Object.keys(original)).toHaveLength(14);
    expect(cs.languages).toEqual(original);
  });

  it('carries name_overrides — 15 entries', () => {
    const original = table('name_overrides');
    expect(Object.keys(original)).toHaveLength(15);
    expect(cs.names).toEqual(original);
  });

  it("carries coords — the script's 16 positions, as { lat, lon } rather than a bare pair", () => {
    const original = table('coords') as unknown as Record<string, [number, number]>;
    expect(Object.keys(original)).toHaveLength(16);
    for (const [code, [lat, lon]] of Object.entries(original)) {
      expect(overrides.coords.overrides[code]).toEqual({ lat, lon });
    }
  });

  it('holds five more positions against upstream, and deliberately not Serbia', () => {
    // Upstream has a position for all six now, and is right about exactly one
    // of them. The five here are held at the shipped value; Serbia is absent so
    // the fetch wins, because 44.13, 16.43 is a point in Bosnia and Herzegovina
    // that the atlas prints as Serbia's own `44.1° N / 16.4° E`.
    const byCode = new Map(baseline.map((country) => [country.code as string, country]));
    const added = Object.keys(overrides.coords.overrides).filter((code) => !(code in table('coords')));
    expect(added).toEqual(['AD', 'IL', 'ME', 'MM', 'VA']);
    for (const code of added) {
      const country = byCode.get(code);
      expect(overrides.coords.overrides[code]).toEqual({ lat: country?.lat, lon: country?.lon });
    }
    expect(overrides.coords.overrides['RS']).toBeUndefined();
  });

  it('carries extra — the 5 records upstream has none of, split across the files that own each field', () => {
    const original = table('extra') as unknown as Record<
      string,
      { capital: string; latlng: [number, number]; region: string; languages: string[] }
    >;
    expect(Object.keys(original)).toHaveLength(5);
    for (const [code, record] of Object.entries(original)) {
      expect(overrides.capitals.missingUpstream[code]).toEqual([record.capital]);
      expect(overrides.coords.missingUpstream[code]).toEqual({ lat: record.latlng[0], lon: record.latlng[1] });
      expect(overrides.regions.missingUpstream[code]).toBe(record.region);
      expect(overrides.languages.missingUpstream[code]).toEqual(record.languages);
    }
  });

  it('turns the inline rules into data, with the threshold spelled out', () => {
    expect(overrides.regions.americasSouth).toEqual(
      [...pythonWords(/if code in '([A-Z ]+)'\.split\(\) else 'North America'/)].sort(),
    );
    expect(archive).toContain("if code=='RU': continent='Europe'");
    expect(archive).toContain("if code in ['TR','CY','GE','AM','AZ','KZ']:continent='Asia'");
    expect(overrides.regions.overrides).toEqual({
      AM: 'Asia', AZ: 'Asia', CY: 'Asia', GE: 'Asia', KZ: 'Asia', RU: 'Europe', TR: 'Asia',
    });
    expect(overrides.easy.populationThreshold).toBe(18_000_000);
    expect(overrides.easy.always).toEqual([...pythonWords(/or code in '([A-Z ]+)'\.split\(\)/)].sort());
    // The plan called this list 27 long. It is 26, and the count is the thing
    // the easy deck is measured against, so it is pinned here.
    expect(overrides.easy.always).toHaveLength(26);
  });

  it('turns the two inline currency-name conditionals into per-locale entries', () => {
    expect(archive).toContain("'zimbabwské zlato (ZiG)' if cc=='ZWG' else 'marocký dirham' if cc=='MAD'");
    expect(cs.currencies).toEqual({ MAD: 'marocký dirham', ZWG: 'zimbabwské zlato (ZiG)' });
  });

  it('transcribes 305 entries in all', () => {
    const sizes = [
      'capital_names', 'cap_overrides', 'notes', 'lang_overrides',
      'currency_overrides', 'lang_names', 'name_overrides', 'coords', 'extra',
    ].map((name) => Object.keys(table(name)).length);
    expect(sizes).toEqual([101, 29, 22, 85, 18, 14, 15, 16, 5]);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(305);
  });

  it('says why for every territorial call, because that is the one thing JSON cannot keep', () => {
    for (const rule of [...overrides.territory.polygons.reassign, ...overrides.territory.polygons.drop]) {
      expect(rule.why.length).toBeGreaterThan(20);
    }
    for (const name of readdirSync(overrideDir)) {
      expect(overrideJson(name)['why']).toBeTypeOf('string');
    }
  });
});

describe('precedence', () => {
  const synthetic = (): FetchedCountry => ({
    code: 'CZ',
    iso3: 'CZE',
    currency: ['CZK', 'EUR'],
    languages: ['cs', 'sk', 'de'],
    excludeLanguages: ['cs', 'pl'],
    lat: 1,
    lon: 2,
    region: 'Europe',
    population: 10_000_000,
    populationYear: 2026,
    populationKind: 'projekce',
    populationSource: 'test',
    text: {
      cs: { name: 'Fetched', capital: ['Prague'], currencyNames: { CZK: 'koruna' }, languageNames: { cs: 'čeština' } },
    },
  });
  const bundle = (over: Partial<LocaleBundle<'cs'>> = {}): LocaleBundle<'cs'> => ({
    locale: 'cs', names: {}, capitals: {}, currencies: {}, languages: {}, notes: {}, ...over,
  });
  const layer = (over: Partial<OverrideBundle> = {}): OverrideBundle => ({
    capitals: { overrides: {}, missingUpstream: {} },
    languages: { overrides: {}, missingUpstream: {}, exclude: {} },
    currencies: { overrides: {}, missingUpstream: {} },
    regions: { americasSouth: [], overrides: {}, missingUpstream: {} },
    easy: { populationThreshold: 18_000_000, always: [] },
    coords: { overrides: {}, missingUpstream: {} },
    territory: { polygons: { reassign: [], drop: [] } },
    ...over,
  });
  const one = (over: Partial<OverrideBundle>, text: Partial<LocaleBundle<'cs'>> = {}) =>
    mergeCountries({ fetched: [synthetic()], overrides: layer(over), bundles: [bundle(text)] });

  it('lets an override for a country field win over the fetched value', () => {
    const { countries } = one({ coords: { overrides: { CZ: { lat: 50, lon: 14 } }, missingUpstream: {} } });
    expect(countries[0]!.lat).toBe(50);
    expect(countries[0]!.lon).toBe(14);
  });

  it('replaces a fetched array whole rather than merging into it', () => {
    // The failure this rules out: a hand-picked list of official languages
    // silently growing a fourth because upstream added one.
    const { countries } = one({ languages: { overrides: { CZ: ['cs'] }, missingUpstream: {}, exclude: {} } });
    expect(countries[0]!.languages).toEqual(['cs']);
    expect(countries[0]!.languageNames).toEqual([{ cs: 'čeština' }]);
  });

  it('unions the exclusion set instead of replacing it, and never narrows one', () => {
    // `exclude` is the one section of languages.json that is additive, and the
    // asymmetry is the whole point: a list that replaced the fetch could drop a
    // language the country actually speaks, and the distractor filter would
    // then offer it as a wrong answer to a question it is a right answer to.
    const { countries } = one({
      languages: { overrides: {}, missingUpstream: {}, exclude: { CZ: ['pl', 'cs'] } },
    });
    // 'cs', 'sk' and 'de' are the fetched languages; 'pl' is the frozen CLDR
    // entry; 'cs' overlaps and must not appear twice.
    expect(countries[0]!.excludeLanguages).toEqual(['cs', 'de', 'pl', 'sk']);
  });

  it('excludes every language it offers, for every country in the dataset', () => {
    // The invariant `makeQuestion` depends on: a language the country speaks
    // can never reach `wrong`. It is asserted over the committed dataset rather
    // than a synthetic row because that is the copy players receive.
    const leaks = baseline.filter((country) =>
      country.languages.some((tag) => !country.excludeLanguages.includes(tag)),
    );
    expect(leaks.map((country) => country.code)).toEqual([]);
  });

  it('carries the frozen CLDR table through into every shipped exclusion list', () => {
    // Regression guard for the loss this block exists to repair: `exclude` is
    // not derivable from anything the fetchers read, so a refresh that stopped
    // unioning it in would shrink 144 exclusion lists silently.
    //
    // The containment runs frozen ⊆ shipped, and only that way. The shipped
    // list is the union of the frozen table, the country's own languages and
    // whatever the fetch reports, so it is *allowed* to be wider — twelve
    // countries are, after the WPP refresh added Guaraní to Argentina and Sámi
    // to Norway. Asserting the reverse would forbid exactly the widening the
    // merge exists to perform, which is what this test did until it met one.
    const frozen = overrides.languages.exclude;
    expect(Object.keys(frozen)).toHaveLength(baseline.length);
    const dropped = baseline.filter((country) => {
      const shipped = new Set<string>(country.excludeLanguages as readonly string[]);
      return !(frozen[country.code] ?? []).every((tag) => shipped.has(tag));
    });
    expect(dropped.map((country) => country.code)).toEqual([]);

    // …and the widening is real, so the direction above is not vacuous.
    const wider = baseline.filter(
      (country) => country.excludeLanguages.length > (frozen[country.code] ?? []).length,
    );
    expect(wider.length).toBeGreaterThan(0);
  });

  it('falls back to missingUpstream only where the fetch has nothing', () => {
    const withHole = { ...synthetic(), currency: [] };
    const { countries } = mergeCountries({
      fetched: [withHole],
      overrides: layer({ currencies: { overrides: {}, missingUpstream: { CZ: ['CZK'] } } }),
      bundles: [bundle()],
    });
    expect(countries[0]!.currency).toEqual(['CZK']);
    // …and never over a fetch that has one.
    expect(one({ currencies: { overrides: {}, missingUpstream: { CZ: ['XXX'] } } }).countries[0]!.currency).toEqual([
      'CZK', 'EUR',
    ]);
  });

  it('translates a fetched capital but never an overridden one', () => {
    expect(one({}, { capitals: { Prague: 'Praha' } }).countries[0]!.capital).toEqual([{ cs: 'Praha' }]);
    const pinned = one(
      { capitals: { overrides: { CZ: ['Praha'] }, missingUpstream: {} } },
      { capitals: { Praha: 'NEVER' } },
    );
    expect(pinned.countries[0]!.capital).toEqual([{ cs: 'Praha' }]);
  });

  it('fails an override for an unknown country code, naming the code', () => {
    expect(() => one({ capitals: { overrides: { XK: ['Priština'] }, missingUpstream: {} } })).toThrow(
      /capitals\.json.*overrides.*"XK"/,
    );
    expect(() => one({ easy: { populationThreshold: 1, always: ['UK'] } })).toThrow(/easy\.json.*always.*"UK"/);
    expect(() => one({}, { notes: { ZZ: 'nowhere' } })).toThrow(/notes\.cs\.json.*notes.*"ZZ"/);
  });

  it('records a shadowed entry when an override suppresses a differing upstream value', () => {
    const { shadowed } = one({ languages: { overrides: { CZ: ['cs'] }, missingUpstream: {}, exclude: {} } });
    expect(shadowed).toEqual([
      { code: 'CZ', source: 'languages.json', field: 'languages', fetched: ['cs', 'sk', 'de'], override: ['cs'] },
    ]);
  });

  it('records nothing when an override and the fetch agree', () => {
    const { shadowed } = one({ languages: { overrides: { CZ: ['cs', 'sk', 'de'] }, missingUpstream: {}, exclude: {} } });
    expect(shadowed).toEqual([]);
  });
});

describe('the basemap', () => {
  const square = (iso3: string, lon: number, lat: number): MapPolygon => ({
    iso3,
    points: [
      [lon, lat],
      [lon + 1, lat],
      [lon + 1, lat + 1],
      [lon, lat + 1],
      [lon, lat],
    ],
  });
  const rules = (over: Partial<TerritoryOverrides['polygons']>): TerritoryOverrides => ({
    polygons: { reassign: [], drop: [], ...over },
  });

  it('fails a reassign rule that matches no polygon, naming the rule', () => {
    expect(() =>
      applyTerritory([square('FRA', 0, 0)], rules({ reassign: [{ iso3: '-99', to: 'FRA', why: 'the rule' }] })),
    ).toThrow(/polygons\.reassign\[0\] \(iso3 "-99" → "FRA"\) matched no polygon.*the rule/s);
  });

  it('fails a reassign rule that matches more than one, naming the rule and the count', () => {
    expect(() =>
      applyTerritory(
        [square('-99', 0, 0), square('-99', 40, 40), square('-99', 80, 10)],
        rules({ reassign: [{ iso3: '-99', to: 'NOR', why: 'ambiguous' }] }),
      ),
    ).toThrow(/polygons\.reassign\[0\] \(iso3 "-99" → "NOR"\) matched 3 polygons/);
  });

  it('narrows an ambiguous rule with a near point, and leaves the others alone', () => {
    const result = applyTerritory(
      [square('-99', 0, 0), square('-99', 40, 40)],
      rules({ reassign: [{ iso3: '-99', near: { lat: 40.5, lon: 40.5 }, to: 'NOR', why: 'the northern one' }] }),
    );
    expect(result.map((p) => p.iso3)).toEqual(['-99', 'NOR']);
  });

  it('removes exactly the polygons a drop rule names', () => {
    const result = applyTerritory(
      [square('ATA', 0, -80), square('FRA', 2, 47), square('ATA', 20, -80)],
      rules({ drop: [{ iso3: 'ATA', near: { lat: -79.5, lon: 20.5 }, why: 'one ice shelf, not both' }] }),
    );
    expect(result.map((p) => p.iso3)).toEqual(['ATA', 'FRA']);
    expect(result[0]!.points[0]).toEqual([0, -80]);
  });

  it('puts a dropped polygon out of reach of the reassign rules', () => {
    expect(() =>
      applyTerritory(
        [square('-99', 0, 0)],
        rules({
          drop: [{ iso3: '-99', why: 'gone' }],
          reassign: [{ iso3: '-99', to: 'FRA', why: 'too late' }],
        }),
      ),
    ).toThrow(/polygons\.reassign\[0\].*matched no polygon/s);
  });
});

describe('applying the layer to the committed baseline', () => {
  it('is a no-op — the merge gives the baseline back, byte for byte', () => {
    const { countries, shadowed } = mergeBaseline();
    expect(serialize(projectLocale(countries, 'cs'))).toBe(baselineText);
    // Nothing is shadowed, because the baseline *is* what these overrides
    // produced: every pinned value still agrees with the value beside it.
    expect(shadowed).toEqual([]);
  });

  it('stops being a no-op when a single override value is perturbed', () => {
    // Without this the gate above would pass just as happily on an empty layer.
    const perturbed = clone(overrides);
    (perturbed.capitals.overrides as Record<string, string[]>)['ZA'] = [
      'Pretoria', 'Kapské Město', 'Johannesburg',
    ];
    const projected = projectLocale(mergeBaseline(perturbed).countries, 'cs');
    expect(serialize(projected)).not.toBe(baselineText);
    expect(projected.find((c) => c.code === 'ZA')!.capital).toEqual([
      'Pretoria', 'Kapské Město', 'Johannesburg',
    ]);
  });

  it('still gives the baseline back when the fetch has lost everything the layer pins', () => {
    // The strong form. Above, every override happens to agree with the fetch,
    // so an override that quietly did nothing would still pass. Here the fetch
    // is wrong wherever the layer has an opinion, so only a layer that really
    // carries the curation can reproduce the baseline.
    const inverse = new Map<string, string>();
    for (const [upstream, czech] of Object.entries(cs.capitals)) if (!inverse.has(czech)) inverse.set(czech, upstream);
    const orphan = new Set(Object.keys(overrides.capitals.missingUpstream));

    const degraded = baseline.map((country): FetchedCountry => {
      const fetched = fetchFromBaseline(country);
      const text = { ...fetched.text.cs! };
      if (cs.names[country.code] !== undefined) text.name = 'UPSTREAM NAME';
      text.capital =
        overrides.capitals.overrides[country.code] !== undefined
          ? ['UPSTREAM CAPITAL']
          : country.capital.map((city) => inverse.get(city) ?? city);
      text.currencyNames = Object.fromEntries(
        Object.entries(text.currencyNames).map(([unit, name]) => [unit, cs.currencies[unit] === undefined ? name : 'UPSTREAM CURRENCY']),
      );
      text.languageNames = Object.fromEntries(
        Object.entries(text.languageNames).map(([tag, name]) => [tag, cs.languages[tag] === undefined ? name : 'UPSTREAM LANGUAGE']),
      );

      const out: FetchedCountry = { ...fetched, text: { cs: text } };
      if (overrides.currencies.overrides[country.code] !== undefined) out.currency = ['XXX'];
      if (overrides.languages.overrides[country.code] !== undefined) out.languages = ['zxx'];
      if (overrides.coords.overrides[country.code] !== undefined) { out.lat = 0; out.lon = 0; }
      out.region =
        overrides.regions.overrides[country.code] !== undefined
          ? 'Africa'
          : country.region === 'North America' || country.region === 'South America'
            ? 'Americas'
            : country.region;

      // The five countries `countryinfo` has no record of at all: capital,
      // position, region and the language fallback reach the dataset through
      // `missingUpstream` and nothing else. Their currency still comes from
      // CLDR, which knows a territory the country database does not.
      if (!orphan.has(country.code)) return out;
      delete out.lat;
      delete out.lon;
      delete out.region;
      return { ...out, languages: [], text: { cs: { ...text, capital: [] } } };
    });

    const { countries, shadowed } = mergeBaseline(overrides, cs, degraded);
    expect(serialize(projectLocale(countries, 'cs'))).toBe(baselineText);
    // And every one of those losses is reported rather than swallowed.
    expect(shadowed.length).toBeGreaterThan(150);
    expect(shadowed).toContainEqual({
      code: 'RU', source: 'regions.json', field: 'region', fetched: 'Africa', override: 'Europe',
    });
  });

  it('reproduces the easy deck exactly — 98 countries, not the plan’s guess', () => {
    const { countries } = mergeBaseline();
    const easy = countries.filter((c) => c.easy).map((c) => c.code as string);
    expect(easy).toEqual(baseline.filter((c) => c.easy).map((c) => c.code as string));
    expect(easy).toHaveLength(98);
    // Both halves of the rule are load-bearing: Iceland is under the threshold
    // and on the list, Zimbabwe is under it and off.
    expect(easy).toContain('IS');
    expect(easy).not.toContain('ZW');
  });

  it('reproduces the region of all 195 countries from an upstream that reports one Americas', () => {
    const degraded = baseline.map((country) => {
      const fetched = fetchFromBaseline(country);
      if (country.region === 'North America' || country.region === 'South America') fetched.region = 'Americas';
      // The seven transcontinental placements are editorial, so upstream is
      // given the opposite of each to prove the override is what decides.
      if (overrides.regions.overrides[country.code] !== undefined) {
        fetched.region = overrides.regions.overrides[country.code] === 'Europe' ? 'Asia' : 'Europe';
      }
      return fetched;
    });
    const { countries } = mergeBaseline(overrides, cs, degraded);
    const byCode = new Map(countries.map((c) => [c.code as string, c.region]));
    expect(byCode.size).toBe(195);
    for (const country of baseline) expect(byCode.get(country.code)).toBe(country.region);
    expect(byCode.get('RU')).toBe('Europe');
    expect(byCode.get('KZ')).toBe('Asia');
    expect(byCode.get('BR')).toBe('South America');
    expect(byCode.get('MX')).toBe('North America');
  });

  it('reproduces the basemap from an upstream that codes none of the five disputed rows', () => {
    // Natural Earth leaves `ISO_A3` unset for France, Norway and the three
    // disputed territories; `ISO_A3_EH` fixes only the first two. This is that
    // upstream, and the layer is what puts the codes back.
    const upstream: MapPolygon[] = baselineMap.map((polygon) => ({
      iso3: polygon.iso3 === 'FRA' || polygon.iso3 === 'NOR' ? UNATTRIBUTED : polygon.iso3,
      points: polygon.points,
    }));
    expect(upstream.filter((p) => p.iso3 === UNATTRIBUTED)).toHaveLength(10);
    expect(JSON.stringify(applyTerritory(upstream, overrides.territory))).toBe(JSON.stringify(baselineMap));
    // The three that stay unattributed stay unattributed on purpose.
    expect(baselineMap.filter((p) => p.iso3 === UNATTRIBUTED)).toHaveLength(3);
  });
});
