/**
 * U14 — the rung that binds the shipped bundle to the fidelity oracle.
 *
 * Every other fidelity gate in this project runs against `src/`. `dist/` is
 * `src/` put through a seeded high-strength obfuscation pass: control-flow
 * flattening, dead-code injection, an RC4 string table, five chained wrapper
 * functions, and `splitStrings` shattering every literal into five-character
 * chunks. Those transforms are the whole point of U13 and they are also five
 * ways for one Czech string in one rarely-taken branch to come out wrong. A
 * twenty-question playthrough touches twenty of the 14,040 question variants;
 * `readable-build.spec.ts` and `obfuscated-build.spec.ts` touch one each. None
 * of them would find it.
 *
 * So this walks all of them, inside the published document, through
 * `window.WorldGeography.getQuestionSet` — the one member U14 added to the
 * debug API, for exactly this.
 *
 * **Why the fixture is not the only oracle.** `questions-golden.json` records
 * what v7 generated from the *v7 dataset*, and U9 accepted the UN WPP
 * substitution, so 2,636 of the 14,040 entries legitimately read differently
 * now — every population question, and five countries' worth of the rest. The
 * gate is therefore stated twice, and neither half subsumes the other in
 * practice:
 *
 *   * against the engine in `src/`, over the dataset that ships, for all
 *     14,040 — this is what catches a transform that broke the bundle, and
 *     `golden.test.ts` is what holds that engine to the fixture;
 *   * against `questions-golden.json` itself, for the 11,404 entries the
 *     shipped dataset still reproduces unchanged — a direct v7-to-browser
 *     claim with no intermediate to trust.
 *
 * English gets the first treatment only: there is no English fixture, because
 * there was no English v7. `locale-integrity.test.ts` holds that half to a
 * property rather than to recorded text, and what is proven here is the narrow
 * thing this file is for — that obfuscation did not change it.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from '../../scripts/build.ts';
import { DIST_OUTPUT } from '../../scripts/obfuscate.ts';
import * as Engine from '../../src/engine/core.ts';
import { csQuestions } from '../../src/i18n/questions.cs.ts';
import { enQuestions } from '../../src/i18n/questions.en.ts';
import type { BaseQuestion, Difficulty, Locale, LocalizedCountry } from '../../src/engine/types.ts';
import {
  FIXTURES_DIR,
  QUESTION_DIFFICULTIES,
  QUESTION_SEEDS,
  type GoldenQuestion,
  type QuestionsGolden,
} from '../helpers/golden.ts';
import '../helpers/page-api.ts';

/** 12 groups of 1,170 questions generated twice over, inside an obfuscated bundle. */
test.setTimeout(600_000);

const page_url = pathToFileURL(join(REPO_ROOT, DIST_OUTPUT)).href;

const countries = JSON.parse(
  readFileSync(join(REPO_ROOT, 'data/build/countries.json'), 'utf8'),
) as LocalizedCountry[];

const golden = JSON.parse(
  readFileSync(join(FIXTURES_DIR, 'questions-golden.json'), 'utf8'),
) as QuestionsGolden;

const BUNDLES = { cs: csQuestions, en: enQuestions } as const;

const KINDS = [...Engine.TYPES, 'flag'] as const;

/** `country/type/difficulty/seed` — how a mismatch names itself. */
const key = (q: { country: string; type: string }, difficulty: Difficulty, seed: number): string =>
  `${q.country}/${q.type}/${difficulty}/${seed}`;

/**
 * The same walk `captureQuestions` performs, in Node, over the shipped dataset.
 *
 * A fresh `rng(seed)` per question rather than one stream for the group: that
 * is how the fixture was recorded, and it is what makes each variant
 * independent of how many came before it.
 */
function expectedSet(locale: Locale, difficulty: Difficulty, seed: number): BaseQuestion[] {
  const bundle = BUNDLES[locale];
  return countries.flatMap((country) =>
    KINDS.map((kind) =>
      Engine.makeQuestion(country, kind, countries, bundle, difficulty, Engine.rng(seed))));
}

/** Ask the published bundle for one group. */
const generatedSet = (page: Page, difficulty: Difficulty, seed: number): Promise<BaseQuestion[]> =>
  page.evaluate(
    ([d, s]) => window.WorldGeography!.getQuestionSet(d as Difficulty, s as number),
    [difficulty, seed] as const,
  );

/**
 * Compare two groups and describe the first few divergences.
 *
 * `toEqual` over 1,170 objects prints a diff nobody can read, and the useful
 * thing about a failure here is *which* question broke, not all of them.
 */
function divergences(
  got: readonly BaseQuestion[],
  want: readonly BaseQuestion[],
  difficulty: Difficulty,
  seed: number,
): string[] {
  const problems: string[] = [];
  for (const [index, expectedQuestion] of want.entries()) {
    const actual = got[index];
    if (actual === undefined) {
      problems.push(`${key(expectedQuestion, difficulty, seed)}: missing from the bundle's output`);
      continue;
    }
    if (JSON.stringify(actual) === JSON.stringify(expectedQuestion)) continue;
    problems.push(
      `${key(expectedQuestion, difficulty, seed)}:\n    src  ${JSON.stringify(expectedQuestion)}\n    dist ${JSON.stringify(actual)}`,
    );
  }
  return problems;
}

/** Switch the published page into English by clicking the control a player clicks. */
async function switchToEnglish(page: Page): Promise<void> {
  await page.locator('#language').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
}

test.beforeEach(async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(String(error)));
  await page.goto(page_url);
  await expect(page.locator('#start')).toBeVisible();
  expect(failures).toEqual([]);
});

test('generates all 14,040 Czech variants exactly as the source engine does', async ({ page }) => {
  const problems: string[] = [];
  let compared = 0;

  for (const difficulty of QUESTION_DIFFICULTIES) {
    for (const seed of QUESTION_SEEDS) {
      const got = await generatedSet(page, difficulty, seed);
      const want = expectedSet('cs', difficulty, seed);

      expect(got, `${difficulty}/${seed}: wrong number of questions`).toHaveLength(want.length);
      problems.push(...divergences(got, want, difficulty, seed));
      compared += got.length;
    }
  }

  // The first few name the country, kind, difficulty and seed, which is what
  // turns "the obfuscated build is wrong" into a line to go and read.
  expect(problems.slice(0, 5).join('\n'), `${String(problems.length)} of ${String(compared)} variants diverged`).toBe('');
  expect(problems).toHaveLength(0);
  expect(compared).toBe(14_040);
});

test('reproduces the recorded v7 text for every entry the dataset has not moved', async ({ page }) => {
  // `questions-golden.json` is keyed by the four coordinates rather than by
  // position: the fixture's own order is `captureQuestions`'s, and relying on
  // it would make this test pass for the wrong reason if either walk changed.
  const recorded = new Map(golden.entries.map((entry) => [
    key(entry, entry.difficulty, entry.seed),
    entry,
  ]));

  const problems: string[] = [];
  let anchored = 0;
  let moved = 0;

  for (const difficulty of QUESTION_DIFFICULTIES) {
    for (const seed of QUESTION_SEEDS) {
      const got = await generatedSet(page, difficulty, seed);
      const want = expectedSet('cs', difficulty, seed);

      for (const [index, source] of want.entries()) {
        const fixture = recorded.get(key(source, difficulty, seed));
        if (fixture === undefined) throw new Error(`questions-golden.json has no ${key(source, difficulty, seed)}`);

        // An entry the shipped dataset renders differently from v7 is a data
        // decision U9 made and reviewed, not a defect here. Those are counted
        // and the count is held down; the rest are held to the recorded text.
        if (!matchesFixture(source, fixture)) { moved += 1; continue; }

        const actual = got[index]!;
        if (!matchesFixture(actual, fixture)) {
          problems.push(
            `${key(fixture, difficulty, seed)}:\n    v7   ${JSON.stringify(fixture.options)} / ${JSON.stringify(fixture.explanation)}`
              + `\n    dist ${JSON.stringify(actual.options)} / ${JSON.stringify(actual.explanation)}`,
          );
        }
        anchored += 1;
      }
    }
  }

  expect(problems.slice(0, 5).join('\n'), `${String(problems.length)} anchored entries diverged`).toBe('');
  expect(problems).toHaveLength(0);

  // A floor rather than an exact count: an accepted `data:refresh` is allowed
  // to move more entries, and the reviewed commit that accepts it should not
  // have to come here. What the floor refuses is the anchor quietly collapsing
  // to nothing — which is how this test would go green while proving less than
  // the one above it.
  console.log(`questions-golden.json anchors ${anchored.toLocaleString('en-US')} of 14,040 entries; ${moved.toLocaleString('en-US')} have moved since v7`);
  expect(anchored + moved).toBe(14_040);
  expect(anchored).toBeGreaterThan(11_000);
});

test('generates the English variants exactly as the source engine does', async ({ page }) => {
  await switchToEnglish(page);

  const problems: string[] = [];
  let compared = 0;

  // Every difficulty at one seed rather than all twelve groups. One group is
  // already every country and every kind, so every English prompt, explanation
  // template, country name, capital, currency and language name has been
  // through the string table; the other three seeds would redraw distractors
  // from the same strings. The difficulties are kept because each one is a
  // different branch of `candidateCountries` and of the population factors.
  for (const difficulty of QUESTION_DIFFICULTIES) {
    const got = await generatedSet(page, difficulty, 0);
    const want = expectedSet('en', difficulty, 0);

    expect(got, `${difficulty}: wrong number of questions`).toHaveLength(want.length);
    problems.push(...divergences(got, want, difficulty, 0));
    compared += got.length;
  }

  expect(problems.slice(0, 5).join('\n'), `${String(problems.length)} of ${String(compared)} English variants diverged`).toBe('');
  expect(problems).toHaveLength(0);
  expect(compared).toBe(countries.length * KINDS.length * QUESTION_DIFFICULTIES.length);

  // The switch is what this test rests on, so it is checked rather than
  // assumed: a `getQuestionSet` that ignored the live bundle would agree with
  // the English oracle above only by agreeing with the Czech one too.
  const sample = await generatedSet(page, 'normal', 0);
  expect(sample.map((q) => q.prompt)).toContain('Which country is highlighted on the globe?');
  expect(sample.map((q) => q.prompt)).not.toContain('Který stát je zvýrazněn na glóbu?');
});

test('refuses arguments it cannot honour, inside the obfuscated bundle', async ({ page }) => {
  // `selfDefending` and control-flow flattening rewrite every `throw` in the
  // file. A guard that stopped throwing would leave `getQuestionSet` returning
  // questions built with a silently defaulted difficulty, and the walks above
  // would still pass — they never pass a bad argument.
  const thrown = await page.evaluate(() => {
    const attempt = (run: () => unknown): string => {
      try { run(); return 'no error'; } catch (error) { return (error as Error).message; }
    };
    return {
      difficulty: attempt(() => window.WorldGeography!.getQuestionSet('brutal' as Difficulty, 0)),
      seed: attempt(() => window.WorldGeography!.getQuestionSet('normal', -1)),
      fraction: attempt(() => window.WorldGeography!.getQuestionSet('normal', 1.5)),
    };
  });

  expect(thrown.difficulty).toMatch(/unknown difficulty brutal/);
  expect(thrown.seed).toMatch(/non-negative integer/);
  expect(thrown.fraction).toMatch(/non-negative integer/);
});

/** The fixture's fields, compared against a question the engine just built. */
function matchesFixture(question: BaseQuestion, fixture: GoldenQuestion): boolean {
  return question.prompt === fixture.prompt
    && question.correct === fixture.correct
    && question.explanation === fixture.explanation
    && question.source === fixture.source
    && JSON.stringify(question.options) === JSON.stringify(fixture.options);
}
