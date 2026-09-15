/**
 * U12 — exactly one correct answer, in either language.
 *
 * R18 is a property, not an example: for every country, every question kind,
 * every difficulty and every seed, the three options a player sees must contain
 * the right answer once and nothing else that is also right. It is enforced by
 * three per-locale tables — the currency units, the special-capital exclusions
 * and the magnitude words — each of which feeds string-equality filtering, so
 * an English list that is a plausible rendering of the Czech rather than a
 * correct list of what the *English dataset* says produces a question with two
 * right answers and fails nothing else.
 *
 * So the walk below is the same 14,040 variants `questions-golden.json` records,
 * run twice, and the answer is checked semantically each time: not "three
 * distinct strings" — that would pass on three wrong ones — but "no option
 * other than the correct one is a true answer to this question", decided
 * against the dataset in that locale.
 *
 * The Czech half of this is not the fixture's job and does not replace it.
 * `golden.test.ts` holds the Czech questions to their recorded text, character
 * for character; this holds both languages to a property, over the dataset the
 * game actually ships rather than the frozen v7 one.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as Core from '../../src/engine/core.ts';
import type {
  Difficulty,
  Locale,
  LocalizedCountry,
  QuestionBundle,
  QuestionKind,
} from '../../src/engine/types.ts';
import { csQuestions } from '../../src/i18n/questions.cs.ts';
import { enQuestions } from '../../src/i18n/questions.en.ts';
import { LOCALES } from '../../src/i18n/locales.ts';
import { renderReview, REVIEW_PATH } from '../../scripts/data/review-en.ts';
import { loadCountries } from '../helpers/load-baseline.ts';

const at = (relative: string): string => fileURLToPath(new URL(`../../${relative}`, import.meta.url));

/** The dataset the game ships, not the frozen v7 fixture. */
const countries = JSON.parse(readFileSync(at('data/build/countries.json'), 'utf8')) as LocalizedCountry[];

const BUNDLES: readonly QuestionBundle[] = [csQuestions, enQuestions];
const KINDS: QuestionKind[] = [...Core.TYPES, 'flag'];
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'expert'];
const SEEDS = [0, 1, 2, 3];

const pick = (text: Readonly<Record<Locale, string>>, bundle: QuestionBundle): string => text[bundle.locale];

/**
 * Every string that would be a true answer to this question.
 *
 * The whole test rests on this being wider than "the correct option": the
 * second correct answer R18 is about is by definition one this set contains and
 * `q.options` should not.
 */
function alsoCorrect(
  country: LocalizedCountry,
  kind: QuestionKind,
  bundle: QuestionBundle,
): Set<string> {
  const special = bundle.specialCapitals[country.code];
  switch (kind) {
    case 'country':
    case 'flag':
      return new Set([pick(country.name, bundle)]);
    case 'capital':
      // Its own capitals and everything the special-capital entry rules out:
      // the seat of government, the claimed city, the other spelling.
      return new Set([
        ...country.capital.map((city) => pick(city, bundle)),
        ...(special?.answer === undefined ? [] : [special.answer]),
        ...(special?.exclude ?? []),
      ]);
    case 'currency':
      return new Set(country.currencyNames.map((unit) => Core.currencyLabel(unit, bundle)));
    case 'language':
      return new Set(country.languageNames.map((name) => pick(name, bundle)));
    default:
      return new Set([Core.populationLabel(country.population, bundle)]);
  }
}

describe('every question variant, in every locale', () => {
  it.each(BUNDLES.map((bundle) => [bundle.locale, bundle] as const))(
    'offers one right answer and two wrong ones in %s',
    (_locale, bundle) => {
      let checked = 0;
      for (const difficulty of DIFFICULTIES) {
        for (const seed of SEEDS) {
          for (const country of countries) {
            for (const kind of KINDS) {
              const q = Core.makeQuestion(country, kind, countries, bundle, difficulty, Core.rng(seed));
              const where = `${bundle.locale}/${difficulty}/${seed}/${country.code}/${kind}`;

              expect({ [where]: q.options.length }).toEqual({ [where]: 3 });
              expect({ [where]: new Set(q.options).size }).toEqual({ [where]: 3 });
              expect({ [where]: q.correct >= 0 && q.correct < 3 }).toEqual({ [where]: true });
              expect({ [where]: q.prompt !== '' && q.explanation !== '' }).toEqual({ [where]: true });

              const right = alsoCorrect(country, kind, bundle);
              const correctness = q.options.map((option) => right.has(option));
              // Index by index, so a failure names the option that is wrongly
              // right rather than printing two arrays.
              expect({ [where]: correctness }).toEqual({
                [where]: [0, 1, 2].map((i) => i === q.correct),
              });
              checked += 1;
            }
          }
        }
      }
      expect(checked).toBe(14040);
    },
    60_000,
  );

  it('never lets a flag question offer a near-identical flag, in either locale', () => {
    for (const bundle of BUNDLES) {
      for (const country of countries) {
        const q = Core.makeQuestion(country, 'flag', countries, bundle, 'normal', Core.rng(7));
        for (const [i, option] of q.options.entries()) {
          if (i === q.correct) continue;
          const other = countries.find((c) => pick(c.name, bundle) === option);
          expect({ [`${bundle.locale}/${country.code}`]: other === undefined }).toEqual({
            [`${bundle.locale}/${country.code}`]: false,
          });
          expect(Core.sameFlagFamily(country.code, other!.code)).toBe(false);
        }
      }
    }
  });
});

describe('the per-locale tables that decide it', () => {
  const byCode = new Map(countries.map((c) => [c.code as string, c]));

  it('names the same currency unit for the same codes in both locales', () => {
    // The load-bearing invariant. Eighteen dollars share one Czech word and one
    // English word, so no country whose currency is a dollar can be offered
    // another country's dollar. If the two tables partitioned the 142 codes
    // differently, one language would be doing that and the other would not.
    const codes = Object.keys(csQuestions.currencyUnits);
    expect(codes.sort()).toEqual(Object.keys(enQuestions.currencyUnits).sort());
    const disagreements: string[] = [];
    for (const a of codes) {
      for (const b of codes) {
        const together = csQuestions.currencyUnits[a] === csQuestions.currencyUnits[b];
        if (together !== (enQuestions.currencyUnits[a] === enQuestions.currencyUnits[b])) {
          disagreements.push(`${a}/${b}`);
        }
      }
    }
    expect(disagreements).toEqual([]);
  });

  it('gives every currency any country uses a unit name in both locales', () => {
    const missing: string[] = [];
    for (const country of countries) {
      for (const unit of country.currency) {
        for (const bundle of BUNDLES) {
          if (bundle.currencyUnits[unit] === undefined) missing.push(`${bundle.locale} ${unit}`);
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it('gives every special capital a question, an answer and an exclusion list in both locales', () => {
    const codes = Object.keys(csQuestions.specialCapitals);
    expect(codes.sort()).toEqual(Object.keys(enQuestions.specialCapitals).sort());
    for (const code of codes) {
      expect(byCode.has(code)).toBe(true);
      for (const bundle of BUNDLES) {
        const entry = bundle.specialCapitals[code]!;
        // Question and answer travel together: an entry with one and not the
        // other would ask a special question and explain an ordinary one.
        expect({ [`${bundle.locale}/${code}`]: entry.question === undefined }).toEqual({
          [`${bundle.locale}/${code}`]: entry.answer === undefined,
        });
        expect(Array.isArray(entry.exclude)).toBe(true);
        expect(entry.exclude.every((city) => city.trim() !== '')).toBe(true);
      }
    }
    // Ten are asked differently; the eleventh is the Netherlands, which is
    // asked the ordinary way and only excludes.
    expect(codes.filter((code) => csQuestions.specialCapitals[code]!.answer !== undefined)).toHaveLength(10);
    expect(csQuestions.specialCapitals['NL']?.answer).toBeUndefined();
  });

  it('keeps the three South African cities and The Hague out of their questions', () => {
    expect(enQuestions.specialCapitals['ZA']?.exclude).toEqual([
      'Cape Town', 'Bloemfontein', 'Johannesburg',
    ]);
    expect(csQuestions.specialCapitals['ZA']?.exclude).toEqual([
      'Kapské Město', 'Bloemfontein', 'Johannesburg',
    ]);
    // Czech has to rule out the Dutch spelling as well, which is the one a
    // Czech reader is likely to have met; English has never used it.
    expect(csQuestions.specialCapitals['NL']?.exclude).toEqual(['Haag', 'The Hague']);
    expect(enQuestions.specialCapitals['NL']?.exclude).toEqual(['The Hague']);

    for (const bundle of BUNDLES) {
      const q = Core.makeQuestion(byCode.get('NL')!, 'capital', countries, bundle, 'normal', Core.rng(3));
      expect(q.options).not.toContain('The Hague');
      expect(q.options).not.toContain('Haag');
    }
  });

  it('labels a population differently in each locale, and never as its own distractor', () => {
    // One country is below a thousand — the Holy See, at 506 — and there the
    // two labels agree, correctly: `populationLabel` prints a bare rounded
    // number with no grouping and no magnitude word, which is the same answer
    // in both languages. Every other country gets a grouped number and a
    // magnitude word, and both of those are language.
    const SAME_IN_BOTH = ['VA'];
    const seen = new Set<string>();
    for (const country of countries) {
      const cs = Core.populationLabel(country.population, csQuestions);
      const en = Core.populationLabel(country.population, enQuestions);
      const agree = SAME_IN_BOTH.includes(country.code);
      expect({ [country.code]: cs === en }).toEqual({ [country.code]: agree });
      if (agree) expect(country.population).toBeLessThan(1000);
      seen.add(`${cs}|${en}`);

      for (const bundle of BUNDLES) {
        const q = Core.makeQuestion(country, 'population', countries, bundle, 'expert', Core.rng(1));
        const answer = Core.populationLabel(country.population, bundle);
        expect(q.options.filter((option) => option === answer)).toHaveLength(1);
      }
    }
    expect(seen.size).toBeGreaterThan(100);
  });

  it('spells the six regions the way the shell does, in both locales', () => {
    for (const bundle of BUNDLES) {
      expect(Object.keys(bundle.regions).sort()).toEqual([...Core.REGIONS].sort());
      for (const region of Core.REGIONS) expect(bundle.regions[region]).not.toBe('');
    }
    expect(csQuestions.regions.Europe).toBe('Evropa');
    expect(enQuestions.regions.Europe).toBe('Europe');
  });
});

describe('the dataset both bundles read', () => {
  it('gives every country a name, a capital, a currency and a language in both locales', () => {
    const gaps: string[] = [];
    for (const country of countries) {
      for (const locale of LOCALES) {
        const blank = (text: Readonly<Record<Locale, string>>): boolean => (text[locale] ?? '').trim() === '';
        if (blank(country.name)) gaps.push(`${country.code} ${locale} name`);
        if (country.capital.length === 0 || country.capital.some(blank)) gaps.push(`${country.code} ${locale} capital`);
        if (country.currencyNames.some((unit) => blank(unit.name))) gaps.push(`${country.code} ${locale} currency`);
        if (country.languageNames.some(blank)) gaps.push(`${country.code} ${locale} language`);
      }
    }
    expect(gaps).toEqual([]);
    expect(countries).toHaveLength(195);
  });

  it('is the dataset the committed review artifact was written from', () => {
    // The artifact is what U17 signs the English names off against, so it has
    // to be the one this dataset produces and not the one it produced once.
    expect(renderReview()).toBe(readFileSync(REVIEW_PATH, 'utf8'));
  });
});

/**
 * Never called. It exists so `tsc --noEmit` checks it, which is where the
 * claims below are actually enforced — vitest transpiles without typechecking,
 * so a runtime assertion could not make them at all.
 *
 * Each `@ts-expect-error` fails the typecheck if the line *stops* being an
 * error, which is the direction that matters: the day someone widens a
 * signature enough to let a Czech capital into an English question, this is
 * what goes red.
 */
function compileTimeClaims(): void {
  const czechOnly = loadCountries();

  // A Czech-only record set cannot be questioned with the English bundle: the
  // records have no `en` to read, and that is a type error rather than a
  // question whose options come back `undefined`.
  // @ts-expect-error — LocalizedCountry<'cs'> is not LocalizedCountry<'en'>
  Core.makeQuestion(czechOnly[0]!, 'country', czechOnly, enQuestions);

  // The same in the other direction, through the whole-game entry point.
  // @ts-expect-error — an English bundle over Czech-only records
  Core.makeGame(czechOnly, { players: 1, difficulty: 'normal', region: 'all', names: ['A'] }, enQuestions);

  // A bundle missing a required table is not a bundle. Dropping `magnitudes`
  // would leave `populationLabel` with nothing to append, which is exactly the
  // half-swapped state KTD12 rules out.
  // @ts-expect-error — no `magnitudes`
  const incomplete: QuestionBundle<'en'> = { ...enQuestions, magnitudes: undefined };
  void incomplete;

  // And a `LocalizedText` cannot be read without a bundle that speaks its
  // language, which is what makes the two claims above hold everywhere rather
  // than only at the entry points.
  // @ts-expect-error — the Czech bundle cannot read an English-only text
  Core.pick({ en: 'Czechia' }, csQuestions);
}
void compileTimeClaims;
