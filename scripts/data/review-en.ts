/**
 * `npm run data:review` — the English dataset, beside the Czech, for a human.
 *
 * U12 generated the English half of the dataset from `Intl.DisplayNames`, which
 * is a defensible way to get 195 country names and no way at all to *check*
 * them: CLDR says "Congo - Kinshasa" and "Myanmar (Burma)", and only a reader
 * knows those are wrong for a quiz. This writes the artifact that reader works
 * from — every English value the pipeline produces, next to its Czech
 * counterpart, with where each one came from.
 *
 * The flag that matters is the last column. An entry the Czech side overrode is
 * one a maintainer has already decided CLDR gets wrong; if English took CLDR's
 * word for the same entry, that is the row to look at first. It is not
 * necessarily an error — Czech pins fifteen names and only four of them correct
 * anything — but it is where the errors are.
 *
 * `--check` re-renders and compares against the committed file instead of
 * writing, which is what `tests/unit/locale-integrity.test.ts` runs: the
 * artifact is the deliverable U17 signs off, so it has to be the artifact this
 * dataset actually produces.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LocalizedCountry } from '../../src/engine/types.ts';
import { buildDataset, loadCountrySnapshot, loadLocaleBundles, loadMapSnapshot, paths } from './apply.ts';
import { loadOverrides } from './merge.ts';
import { csQuestions } from '../../src/i18n/questions.cs.ts';
import { enQuestions } from '../../src/i18n/questions.en.ts';

/** Where the committed artifact lives. */
export const REVIEW_PATH = fileURLToPath(new URL('../../docs/reviews/english-dataset.md', import.meta.url));

/** One row: the same fact in two languages, and where each came from. */
interface Row {
  key: string;
  cs: string;
  en: string;
  csPinned: boolean;
  enPinned: boolean;
}

const cell = (text: string): string => text.replaceAll('|', '\\|');

/**
 * Where a row's English value came from.
 *
 * `upstream` rather than `CLDR` for capitals, because a capital is not a CLDR
 * lookup at all — it is the name `world-countries` or `capitals.json` carries,
 * which is already English. That difference is the reason the review signal
 * below is scoped per table rather than applied to everything: a Czech capital
 * override is an exonym, which is expected and says nothing about the English
 * side, while a Czech *name* override is somebody deciding CLDR got it wrong.
 */
type Provenance = 'CLDR' | 'upstream';

const source = (row: Row, from: Provenance): string => (row.enPinned ? 'pinned' : from);

/** Where a reviewer looks first: Czech corrected CLDR and English took its word. */
const needsReview = (row: Row): boolean => row.csPinned && !row.enPinned;

function table(
  rows: readonly Row[],
  heading: string,
  keyLabel: string,
  from: Provenance,
  /** False where a Czech override is an exonym rather than a correction. */
  flagRows: boolean,
  note: string,
): string[] {
  const pinned = rows.filter((row) => row.enPinned).length;
  const flagged = rows.filter(needsReview).length;
  return [
    `## ${heading}`,
    '',
    `${rows.length} entries: ${pinned} pinned in \`countries.en.json\`, ${rows.length - pinned} taken from ${from}.`,
    `${flagged} of them are ones the Czech side overrode and the English side did not.`,
    note,
    '',
    `| ${keyLabel} | Czech | English | Czech overrides | English source |`,
    '| --- | --- | --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| ${cell(row.key)} | ${cell(row.cs)} | ${cell(row.en)} | ${row.csPinned ? 'yes' : ''} | ` +
        `${flagRows && needsReview(row) ? `**${source(row, from)}**` : source(row, from)} |`,
    ),
    '',
  ];
}

export function renderReview(root?: string): string {
  const at = paths(root);
  const overrides = loadOverrides(at.overrides);
  const bundles = loadLocaleBundles(at.overrides);
  const snapshot = loadCountrySnapshot(at.rawCountries);
  const [cs, en] = bundles as [(typeof bundles)[number], (typeof bundles)[number]];
  const built = buildDataset({
    snapshot,
    map: loadMapSnapshot(at.rawMap),
    overrides,
    bundles,
  });
  const countries: LocalizedCountry[] = built.countries;

  const names: Row[] = countries.map((country) => ({
    key: country.code as string,
    cs: country.name.cs,
    en: country.name.en,
    csPinned: cs.names[country.code] !== undefined,
    enPinned: en.names[country.code] !== undefined,
  }));

  // Capitals are keyed by the name `capitals.json` and the fetch use, which is
  // also the key both translation tables are keyed by — so one row per distinct
  // upstream city, not one per country.
  const upstream = new Map<string, Row>();
  for (const country of countries) {
    const fetched = snapshot.countries.find((entry) => entry.code === country.code);
    const pinned = overrides.capitals.overrides[country.code];
    const keys = pinned ?? fetched?.text.en?.capital ?? overrides.capitals.missingUpstream[country.code] ?? [];
    country.capital.forEach((city, i) => {
      const key = keys[i] ?? city.en;
      if (upstream.has(key)) return;
      upstream.set(key, {
        key,
        cs: city.cs,
        en: city.en,
        csPinned: cs.capitals[key] !== undefined,
        enPinned: en.capitals[key] !== undefined,
      });
    });
  }
  const capitals = [...upstream.values()].sort((a, b) => a.key.localeCompare(b.key, 'en'));

  const currencySeen = new Map<string, Row>();
  for (const country of countries) {
    for (const unit of country.currencyNames) {
      if (currencySeen.has(unit.code)) continue;
      currencySeen.set(unit.code, {
        key: `${unit.code} · ${csQuestions.currencyUnits[unit.code] ?? '—'} / ${enQuestions.currencyUnits[unit.code] ?? '—'}`,
        cs: unit.name.cs,
        en: unit.name.en,
        csPinned: cs.currencies[unit.code] !== undefined,
        enPinned: en.currencies[unit.code] !== undefined,
      });
    }
  }
  const currencies = [...currencySeen.values()].sort((a, b) => a.key.localeCompare(b.key, 'en'));

  const languageSeen = new Map<string, Row>();
  for (const country of countries) {
    country.languages.forEach((tag, i) => {
      if (languageSeen.has(tag)) return;
      const name = country.languageNames[i];
      if (name === undefined) return;
      languageSeen.set(tag, {
        key: tag as string,
        cs: name.cs,
        en: name.en,
        csPinned: cs.languages[tag] !== undefined,
        enPinned: en.languages[tag] !== undefined,
      });
    });
  }
  const languages = [...languageSeen.values()].sort((a, b) => a.key.localeCompare(b.key, 'en'));

  const all = [...names, ...capitals, ...currencies, ...languages];
  const flagged = [...names, ...currencies, ...languages].filter(needsReview);

  return [
    '# English dataset — review artifact',
    '',
    '<!-- Machine-written by `npm run data:review`. Do not hand-edit: edit',
    '     `data/overrides/countries.en.json` and regenerate. -->',
    '',
    `Generated from the fetch of ${snapshot.fetchedAt}, reference year ${snapshot.year}.`,
    '',
    'Every English value the pipeline produces, beside its Czech counterpart.',
    '`pinned` means `data/overrides/countries.en.json` names it. `CLDR` means the',
    'value is whatever `Intl.DisplayNames` returned and nobody has looked at it.',
    'A **bold** source is the row to look at first: the Czech side decided CLDR',
    'was wrong there, and the English side took its word.',
    '',
    `${all.length} values in total; ${flagged.length} where Czech corrected CLDR and English did not.`,
    '',
    ...(flagged.length === 0
      ? ['Nothing is outstanding.', '']
      : [`Outstanding: ${flagged.map((row) => row.key).join(', ')}`, '']),
    ...table(
      names,
      'Country names',
      'Code',
      'CLDR',
      true,
      'CLDR gives four of these a form a quiz cannot use — two Congos disambiguated' +
        ' with a city, Myanmar with a parenthesis, Palestine as a territory — and those' +
        ' four are pinned. The rest are pinned where they are already right, so a CLDR' +
        ' release that moves one is reported as a shadowed change rather than shipped.',
    ),
    ...table(
      capitals,
      'Capitals',
      'Upstream name',
      'upstream',
      false,
      'English is the language upstream writes these in, so an English entry is a' +
        ' respelling and a Czech entry is an exonym. A Czech override here is expected' +
        ' and is not a signal about the English side, which is why the count above is' +
        ' reported and not flagged in the totals.',
    ),
    ...table(
      currencies,
      'Currencies',
      'Code · quiz unit (cs / en)',
      'CLDR',
      true,
      'The quiz unit in the key is the bare word a player is offered as an option;' +
        ' the two columns are the full name the atlas and the explanation print.',
    ),
    ...table(languages, 'Languages', 'Tag', 'CLDR', true, ''),
  ].join('\n');
}

const invoked = process.argv[1];
if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const rendered = renderReview();
  if (argv.includes('--check')) {
    const committed = readFileSync(REVIEW_PATH, 'utf8');
    if (committed === rendered) {
      console.log('docs/reviews/english-dataset.md is what this dataset produces.');
    } else {
      console.error(
        'docs/reviews/english-dataset.md is out of date. Run `npm run data:review` and commit the result.',
      );
      process.exit(1);
    }
  } else {
    writeFileSync(REVIEW_PATH, rendered, 'utf8');
    console.log(`wrote ${REVIEW_PATH}`);
  }
}

