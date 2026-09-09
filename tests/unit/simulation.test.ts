/**
 * U3 — port of the archived `tests/simulation.test.js`.
 *
 * The Monte Carlo model in `scripts/simulate.ts` reasons about the attempt
 * economy in closed form; the game plays it out question by question. They are
 * only worth anything if they agree, so 48 seeded configurations are run
 * through both and compared field by field. The original wrote its counters to
 * `tests/simulation-test-results.json`; they are assertions here.
 *
 * The full 61-second sweep stays a script (`npm run simulate`) and never runs
 * in CI — these 48 comparisons are the part that is cheap enough to run on
 * every commit.
 */
import { describe, expect, it } from 'vitest';
import { averagePoints, expectation, simulate } from '../../scripts/simulate.ts';
import { loadCore, loadCountries, type Game, type Question } from '../helpers/load-baseline.ts';

const Core = loadCore();
const all = loadCountries();

describe('the scoring formula the model assumes', () => {
  it('matches the engine on 8,859 samples across all three limits', () => {
    let samples = 0;
    for (const limit of Object.values(Core.TIME_LIMITS)) {
      for (let elapsed = 0; elapsed <= limit; elapsed += 7) {
        const original = elapsed >= limit ? 0 : 100 + Math.round(90 * (1 - elapsed / limit)) * 10;
        expect(Core.pointsForTime(elapsed, limit)).toBe(original);
        samples += 1;
      }
    }
    expect(samples).toBe(8859);
  });

  it('keeps the economic constants the model is written against', () => {
    expect(Core.MILESTONE_LIVES).toBe(2);
    expect(Core.BASE_POINTS).toBe(100);
    expect(Core.MAX_POINTS).toBe(1000);
  });

  it('integrates a uniform 1-5 s response to exactly 865 mean points', () => {
    expect(Math.abs(averagePoints({ timeRangeMs: [1000, 5000] }) - 865)).toBeLessThan(1e-9);
  });

  it('puts the survival break-even between a three- and a five-second answer', () => {
    expect(expectation({ elapsedMs: 5000 }).netReservePerCountry).toBeLessThan(0);
    expect(expectation({ elapsedMs: 3000 }).netReservePerCountry).toBeGreaterThan(0);
  });
});

describe('the simulator against the full engine', () => {
  it('agrees on score, reserve, countries and answer counts across 48 configurations', () => {
    let comparisons = 0;
    let totalAnswers = 0;

    for (const timeRangeMs of [null, [1000, 5000]] as ([number, number] | null)[]) {
      for (let run = 0; run < 24; run += 1) {
        const seed = 710071 + run;
        const cap = 150;
        const elapsedMs = 5000;
        const reduced = simulate({
          seed,
          trials: 1,
          capCountries: cap,
          elapsedMs,
          timeRangeMs,
        });
        const random = Core.rng(seed);
        const g: Game = Core.makeGame(
          all,
          { players: 1, difficulty: 'normal', region: 'all', names: ['Test'] },
          seed,
        );

        let countries = 1;
        let flags = 0;
        let flagCorrect = 0;
        let regulars = 0;
        let regularCorrect = 0;
        while (!g.completed) {
          const q = g.questions[g.index] as Question;
          const correct = random() < 0.8;
          // Timing randomness is independent of correctness, and is omitted for
          // wrong answers in both models because it affects neither the score
          // nor the country/bonus ordering.
          const elapsed =
            correct && timeRangeMs
              ? timeRangeMs[0] + random() * (timeRangeMs[1] - timeRangeMs[0])
              : elapsedMs;
          Core.submit(g, correct ? q.correct : (q.correct + 1) % 3, elapsed);
          if (q.type === 'flag') {
            flags += 1;
            if (correct) flagCorrect += 1;
          } else {
            regulars += 1;
            if (correct) regularCorrect += 1;
          }
          if (countries === cap && Core.nextTurn(g).kind === 'country') break;
          if (!Core.advance(g, all)) break;
          if ((g.questions[g.index] as Question).type === 'country') countries += 1;
        }

        expect(g.scores[0]).toBe(reduced.totalScore);
        expect(g.lives[0]).toBe(reduced.totalReserve);
        expect(countries).toBe(reduced.totalCountries);
        expect(flags).toBe(reduced.flagAnswers);
        expect(flagCorrect).toBe(reduced.flagCorrect);
        expect(regulars).toBe(reduced.regularAnswers);
        expect(regularCorrect).toBe(reduced.regularCorrect);
        expect(g.scoreLives[0]).toBe(reduced.scoreAttemptAwards);
        expect(Core.validateProgress(g)).toBe(true);

        comparisons += 1;
        totalAnswers += g.answers.length;
      }
    }

    expect(comparisons).toBe(48);
    expect(totalAnswers).toBe(19762);
  });
});
