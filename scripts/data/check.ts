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
import type { Locale, LocalizedCountry, LocalizedText } from '../../src/engine/types.ts';
import {
  buildDataset,
  loadCountrySnapshot,
  loadLocaleBundles,
  loadMapSnapshot,
  paths,
  serializeCountries,
  serializeMap,
} from './apply.ts';
import { BASE_LOCALE, DATASET_LOCALES, loadOverrides, UNATTRIBUTED, type MapPolygon } from './merge.ts';
import { EDITION_PATTERN, findRetiredSources, loadLock, type SourceEntry } from './sources.ts';

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
  countries: readonly LocalizedCountry[];
  /**
   * `data/raw/countries.json`'s `schemaVersion`. See `SCHEMA_VERSION`.
   *
   * The both-locales invariant below is gated on it rather than run always,
   * because it was written in U9 against a dataset that was still monolingual:
   * inert at 1, fatal at 2, and U12 is the commit that sets 2. A check that
   * cannot be landed before the thing it checks exists is a check that gets
   * written after the fact, or not at all.
   */
  schemaVersion: number;
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
  const base = (text: LocalizedText): string => text[BASE_LOCALE];

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
    if (country.capital.length === 0 || country.capital.some((city) => base(city) === '')) holes.push(`${code} capital`);
    if (country.languages.length === 0) holes.push(`${code} languages`);
    if (country.languageNames.length !== country.languages.length) holes.push(`${code} languageNames`);
    if (country.currency.length === 0) holes.push(`${code} currency`);
    if (!REGIONS.includes(country.region)) holes.push(`${code} region "${country.region}"`);
    if (base(country.name) === '') holes.push(`${code} name`);
    if (flags[code] === undefined) holes.push(`${code} flags.json`);
    if (!input.hasFlagFile(code)) holes.push(`${code} assets/flags/${code}.png`);
  }
  results.push(
    holes.length === 0
      ? ok('every country is playable', 'flag, capital, language, currency and region for all 195')
      : bad('every country is playable', list(holes, 12)),
  );

  // --- every label a player reads is a word ---------------------------
  // `Intl.DisplayNames` is configured to fall back to the code, so a tag CLDR
  // has no Czech name for comes back as itself: `bjz`, `KID`, `TVD`. Those are
  // not obviously wrong to any other check — they are non-empty strings of the
  // right length in the right field — and they reach the player as an answer
  // option reading "bjz". The committed dataset has none, which is what makes
  // this a floor rather than an aspiration.
  const untranslated: string[] = [];
  for (const country of countries) {
    const code = country.code as string;
    for (const locale of DATASET_LOCALES) {
      country.languages.forEach((tag, i) => {
        if (country.languageNames[i]?.[locale] === tag) untranslated.push(`${code} ${locale} language ${tag}`);
      });
      for (const unit of country.currencyNames) {
        if (unit.name[locale] === unit.code) untranslated.push(`${code} ${locale} currency ${unit.code}`);
      }
    }
  }
  results.push(
    untranslated.length === 0
      ? ok('every label is a word', 'no language or currency falls back to its own code')
      : bad(
          'every label is a word',
          `${list(untranslated, 8)}. CLDR has no name for these, so Intl.DisplayNames returned the ` +
            `code and a player would be offered it as an answer. Give it a name in ` +
            `data/overrides/countries.<locale>.json, or drop the code in languages.json / currencies.json.`,
        ),
  );

  // --- both locales, or neither ---------------------------------------
  // The invariant a bilingual dataset lives or dies by. A country whose English
  // name never got written still has a Czech one, still passes every check
  // above, and reaches an English player as an answer option reading "Česko" —
  // or, worse, as an empty string that `uniqueWrong` silently drops, leaving a
  // question with two options and a throw. Written in U9 and gated from the
  // start: at `schemaVersion: 1` the dataset was monolingual by design and this
  // would have been red for three units.
  if (input.schemaVersion >= 2) {
    const gaps: string[] = [];
    for (const country of countries) {
      const code = country.code as string;
      for (const locale of DATASET_LOCALES) {
        const blank = (text: LocalizedText): boolean => (text[locale] ?? '').trim() === '';
        if (blank(country.name)) gaps.push(`${code} ${locale} name`);
        if (country.capital.some(blank)) gaps.push(`${code} ${locale} capital`);
        if (country.currencyNames.some((unit) => blank(unit.name))) gaps.push(`${code} ${locale} currency`);
        if (country.languageNames.some(blank)) gaps.push(`${code} ${locale} language`);
      }
    }
    results.push(
      gaps.length === 0
        ? ok(
            'every country speaks both locales',
            `name, capital, currency and language in ${DATASET_LOCALES.join(' and ')} for all ${countries.length}`,
          )
        : bad(
            'every country speaks both locales',
            `${list(gaps, 12)}. A missing translation is not a missing label — it is an answer ` +
              `option in the wrong language, or an empty one (R17).`,
          ),
    );
  }

  // --- the distractor filter has something to filter with -------------
  // `makeQuestion` builds the wrong answers for a language question by taking
  // every candidate country's languages and dropping the ones this country
  // excludes. Two ways that produces a question with two correct answers, and
  // this asserts against both: a language the country itself speaks that is
  // missing from its own exclusion list, and an entry of the frozen CLDR
  // territory-language table in `languages.json` that did not survive the
  // merge. The second is the one worth a check of its own — nothing the
  // fetchers read can rebuild that table, so a merge that stopped unioning it
  // in would shrink 144 exclusion lists and fail no other invariant.
  const narrowed: string[] = [];
  for (const country of countries) {
    const code = country.code as string;
    const excluded = new Set<string>(country.excludeLanguages as readonly string[]);
    const own = country.languages.filter((tag) => !excluded.has(tag));
    if (own.length > 0) narrowed.push(`${code} speaks but does not exclude ${own.join(', ')}`);
    const frozen = (overrides.languages.exclude[code] ?? []).filter((tag) => !excluded.has(tag));
    if (frozen.length > 0) narrowed.push(`${code} dropped the frozen ${frozen.join(', ')}`);
  }
  results.push(
    narrowed.length === 0
      ? ok(
          'exclusion lists only widen',
          `all ${countries.length} cover their own languages and the frozen CLDR set`,
        )
      : bad(
          'exclusion lists only widen',
          `${list(narrowed, 6)}. A language the country speaks can reach the wrong answers, ` +
            `so the question has two correct ones (R18).`,
        ),
  );

  // --- no sentinel codes reach the dataset ---------------------------
  const sentinelCountries = countries.filter(
    (country) => country.code === UNATTRIBUTED || country.iso3 === UNATTRIBUTED,
  );
  results.push(
    sentinelCountries.length === 0
      ? ok('no -99 country codes', 'every country carries a real ISO code')
      : bad('no -99 country codes', list(sentinelCountries.map((c) => base(c.name)))),
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
  // Both files are written by JSON.stringify, which emits `20` for a whole
  // number. An integral float in either means the value went through a
  // formatter it should not have: `map.json` carried 135 of them until the
  // basemap was normalized, inherited from the CPython script that first wrote
  // it, and reproducing them kept this pipeline importing the frozen legacy
  // builder. Nothing is exempt now, which is what lets the check be phrased as
  // a fact about the dataset rather than about which script happened to write
  // which file.
  const integralFloats = [
    ...(countriesText.match(INTEGRAL_FLOAT) ?? []),
    ...(mapText.match(INTEGRAL_FLOAT) ?? []),
  ];
  const exponents = [...(countriesText.match(EXPONENT) ?? []), ...(mapText.match(EXPONENT) ?? [])];
  results.push(
    integralFloats.length === 0 && exponents.length === 0
      ? ok('numeric shape', 'no integral floats and no exponent forms in countries.json or map.json')
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
  const countries = JSON.parse(countriesText) as LocalizedCountry[];
  const snapshot = loadCountrySnapshot(at.rawCountries);
  return [
    ...datasetChecks({
      countries,
      schemaVersion: snapshot.schemaVersion,
      polygons: JSON.parse(mapText) as MapPolygon[],
      countriesText,
      mapText,
      overrides: loadOverrides(at.overrides),
      flags: JSON.parse(readFileSync(at.flags, 'utf8')) as Record<string, string>,
      hasFlagFile: (code) => existsSync(join(at.root, 'assets/flags', `${code}.png`)),
    }),
    reproduction(at, countriesText, mapText),
    ...provenance(at, countries),
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
      bundles: loadLocaleBundles(at.overrides),
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

/**
 * Which pipeline produced the dataset on disk, read off the dataset itself.
 *
 * `populationSource` is the one field that records where a row's number came
 * from, and it is written by whichever pipeline built the row: the archived
 * `prepare_data.py` stamped every row `worldometer-un-2026`, and `assembleFetch`
 * stamps `un-wpp-2024-<year>`. A dataset holding both is a half-applied accept
 * and is a failure in its own right.
 */
export type DatasetProvenance = 'legacy-python' | 'node-pipeline' | 'mixed';

export function datasetProvenance(countries: readonly LocalizedCountry[]): DatasetProvenance {
  const legacy = countries.filter((country) => country.populationSource.startsWith('worldometer-')).length;
  const pipeline = countries.filter((country) => country.populationSource.startsWith('un-wpp-')).length;
  if (legacy === countries.length) return 'legacy-python';
  if (pipeline === countries.length) return 'node-pipeline';
  return 'mixed';
}

/** Named in the notices whenever the legacy dataset is the one that ships. */
const LEGACY_CREDITS: readonly string[] = ['Worldometer', 'CountryInfo', 'Babel'];

/**
 * The notices have to describe the dataset that ships — not the pipeline that
 * could rebuild it.
 *
 * The distinction is the whole check, and getting it wrong is not hypothetical:
 * U9 rewrote these files to credit a sha256-pinned WPP download and
 * `world-countries` under ODbL while `data/build/countries.json` was still, byte
 * for byte, what `prepare_data.py` produced from a Worldometer transcription and
 * CountryInfo 0.1.2. Every player then read a provenance page naming four
 * sources that had never touched a number in front of them, and the MIT notice
 * of a package whose output they were actually looking at had been deleted.
 *
 * So the expected credits are derived from `populationSource` rather than
 * listed here. An accepted refresh flips 195 rows and the required notices flip
 * with them in the same commit; neither half can move alone without failing.
 */
function provenance(at: ReturnType<typeof paths>, countries: readonly LocalizedCountry[]): CheckResult[] {
  const results: CheckResult[] = [];
  const noticesText = readFileSync(at.notices, 'utf8');
  const sourcesText = readFileSync(at.sources, 'utf8');
  const thirdPartyText = readFileSync(at.thirdParty, 'utf8');
  const files = [
    { path: 'data/embedded-notices.txt', text: noticesText },
    { path: 'data/build/sources.json', text: sourcesText },
    { path: 'THIRD_PARTY_NOTICES.txt', text: thirdPartyText },
  ];
  const kind = datasetProvenance(countries);

  // The two notice documents are inlined and served separately, so a reader can
  // meet either one alone. Asserting the provenance blocks match is cheaper
  // than asserting the files match — they legitimately differ elsewhere, the
  // embedded copy carrying the MIT header and the full licence texts.
  results.push(sameProvenanceBlocks(noticesText, thirdPartyText), editionDate(at));

  if (kind === 'mixed') {
    results.push(
      bad(
        'provenance matches the dataset',
        'countries.json mixes worldometer- and un-wpp- population sources. An accept writes all ' +
          '195 rows at once, so this is a half-applied write or a hand edit — no notice can be ' +
          'right about a dataset that is two datasets.',
      ),
    );
    return results;
  }

  if (kind === 'legacy-python') {
    // The shipped numbers are the archived script's. The notices have to say so,
    // and must not present this pipeline's pinned downloads as their source.
    const missing = LEGACY_CREDITS.filter((needle) => !noticesText.includes(needle));
    const overclaimed: string[] = [];
    try {
      for (const [id, pin] of Object.entries(loadLock(at.lock).remote)) {
        if (id !== 'natural-earth' && noticesText.includes(pin.sha256)) overclaimed.push(id);
      }
    } catch {
      // A missing lock is the next check's problem, not this one's.
    }
    if (noticesText.includes('Derivative Database')) overclaimed.push('world-countries (ODbL share-alike)');
    results.push(
      missing.length === 0 && overclaimed.length === 0
        ? ok(
            'provenance matches the dataset',
            `countries.json is the archived prepare_data.py build, and the notices credit ` +
              `${LEGACY_CREDITS.join(', ')} — the sources that produced it`,
          )
        : bad(
            'provenance matches the dataset',
            [
              missing.length > 0 ? `the notices no longer credit ${list(missing)}` : '',
              overclaimed.length > 0
                ? `the notices claim ${list(overclaimed)} produced data that predates the fetch`
                : '',
            ]
              .filter((line) => line !== '')
              .join('; ') +
              `. The shipped populations are a Worldometer transcription; run ` +
              `npm run data:refresh -- --accept to make the pipeline's provenance true, or restore ` +
              `the notices that describe what is actually in data/build/.`,
          ),
    );
    // The basemap is the one thing both pipelines agree on, so its pin is
    // credited in either mode.
    results.push(naturalEarthCredited(at, noticesText, sourcesText));
    return results;
  }

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

  results.push(citationsSpeakBothLocales(sourcesText));

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

/**
 * The edition date the sources dialog shows a player, against the date the
 * snapshot was actually fetched.
 *
 * It used to be written twice in the dialog — once as Czech prose, once as the
 * ISO string stamped into the JSON export — and both were hardcoded, so both
 * said "7. září 2026" for as long as nobody remembered them. Since U11 there is
 * one ISO constant, formatted per locale at render time, and this checks that
 * constant. A date is the one claim on that page a reader has no way to check,
 * which is the argument for checking it here.
 */
function editionDate(at: ReturnType<typeof paths>): CheckResult {
  const name = 'the edition date matches the snapshot';
  try {
    const fetchedAt = loadCountrySnapshot(at.rawCountries).fetchedAt;
    const dialog = readFileSync(join(at.root, 'src/app/dialogs/sources.ts'), 'utf8');
    const stamped = EDITION_PATTERN.exec(dialog)?.[0];

    if (stamped === undefined) return bad(name, 'src/app/dialogs/sources.ts has no EDITION constant');
    return stamped.includes(`'${fetchedAt}'`)
      ? ok(name, `the dialog and the JSON export both read ${fetchedAt}, in whichever language`)
      : bad(
          name,
          `data/raw/countries.json was fetched ${fetchedAt}, but the dialog still says ` +
            `${stamped}. Run npm run data:refresh -- --accept, which restamps it.`,
        );
  } catch (error) {
    return bad(name, error instanceof Error ? error.message : String(error));
  }
}

/** The provenance headings both notice documents carry, and must agree on. */
const SHARED_NOTICE_BLOCKS: readonly string[] = [
  'NATURAL EARTH',
  'POPULATION FACTS',
  'COUNTRY REFERENCE FACTS',
  'FLAG ILLUSTRATIONS',
];

/** The lines under `heading`, up to the next all-caps heading or the end. */
function noticeBlock(text: string, heading: string): string | null {
  const lines = text.split('\n');
  const at = lines.indexOf(heading);
  if (at < 0) return null;
  const body: string[] = [];
  for (let i = at + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^[A-Z][A-Z0-9 /().-]*$/.test(line) && line.trim() !== '' && body.length > 0) break;
    body.push(line);
  }
  return body.join('\n').trim();
}

function sameProvenanceBlocks(notices: string, thirdParty: string): CheckResult {
  const name = 'both notice documents agree';
  const disagree: string[] = [];
  for (const heading of SHARED_NOTICE_BLOCKS) {
    const a = noticeBlock(notices, heading);
    const b = noticeBlock(thirdParty, heading);
    if (a === null) disagree.push(`${heading} is missing from data/embedded-notices.txt`);
    else if (b === null) disagree.push(`${heading} is missing from THIRD_PARTY_NOTICES.txt`);
    else if (a !== b) disagree.push(`${heading} differs between the two`);
  }
  return disagree.length === 0
    ? ok(name, `${SHARED_NOTICE_BLOCKS.length} provenance blocks are identical in both`)
    : bad(
        name,
        `${disagree.join('; ')}. The game inlines one and the deploy serves the other, so a reader ` +
          `can meet either alone; both are rewritten by an accepted refresh.`,
      );
}

/**
 * Natural Earth, credited in both modes.
 *
 * v7's basemap and the pinned v5.1.2 download agree to within eight coordinates
 * of 21,284, each one rounding tie broken the other way — about a hundred metres
 * on a 1:110m generalization. The release really is what ships, so the credit is
 * true whichever pipeline last wrote `countries.json`.
 */
/**
 * Every citation says its piece in both languages.
 *
 * U17: the sources dialog is the one screen where the game explains where its
 * facts came from, and a citation that names its source but describes the use
 * in Czech tells an English reader nothing about why the link is there. This
 * asserts presence, not quality — that the field exists and is not blank in
 * either locale. Whether the English is a real translation rather than the
 * Czech copied across is a question about editorial work and is asserted in
 * `tests/unit/english-copy.test.ts`, against this repo's file; a scratch repo built
 * from the frozen v7 citation list migrates that file and legitimately has the
 * Czech in both halves until someone translates it.
 */
function citationsSpeakBothLocales(sourcesText: string): CheckResult {
  const name = 'every citation speaks both locales';
  let entries: SourceEntry[];
  try {
    entries = JSON.parse(sourcesText) as SourceEntry[];
  } catch (error) {
    return bad(name, `data/build/sources.json does not parse: ${error instanceof Error ? error.message : String(error)}`);
  }
  const blank: string[] = [];
  for (const entry of entries) {
    const label = entry.name?.cs ?? entry.url;
    for (const locale of DATASET_LOCALES) {
      if ((entry.name?.[locale] ?? '').trim() === '') blank.push(`${label} name.${locale}`);
      if ((entry.use?.[locale] ?? '').trim() === '') blank.push(`${label} use.${locale}`);
    }
  }
  return blank.length === 0
    ? ok(name, `${entries.length} citations, each with a name and a use in ${DATASET_LOCALES.join(' and ')}`)
    : bad(name, `blank or missing: ${list(blank)}`);
}

function naturalEarthCredited(
  at: ReturnType<typeof paths>,
  noticesText: string,
  sourcesText: string,
): CheckResult {
  const name = 'the basemap credits Natural Earth';
  try {
    const pin = loadLock(at.lock).remote['natural-earth'];
    if (pin === undefined) return bad(name, `${at.lock}: no natural-earth pin`);
    const inNotices = noticesText.includes('NATURAL EARTH') || noticesText.includes('Natural Earth');
    const inSources = sourcesText.includes('Natural Earth');
    return inNotices && inSources
      ? ok(name, 'both the embedded notices and sources.json name it')
      : bad(name, `missing from ${[inNotices ? '' : 'the notices', inSources ? '' : 'sources.json'].filter(Boolean).join(' and ')}`);
  } catch (error) {
    return bad(name, error instanceof Error ? error.message : String(error));
  }
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
