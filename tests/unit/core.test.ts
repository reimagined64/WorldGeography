/**
 * U3 — port of the archived `tests/core.test.js`, driving the U4 engine.
 *
 * The original wrote its counters to `tests/core-results.json`; here they are
 * assertions, because a count that is only printed cannot fail. The recorded
 * numbers (14,040 question variants, 42 configurations, and the two full-engine
 * runs) are the v7 values from that file, inlined so the suite keeps meaning
 * after `original-source/` is deleted in U14. They were produced by the
 * original JavaScript and are asserted here against the TypeScript port.
 */
import { describe, expect, it } from 'vitest';
import * as Core from '../../src/engine/core.ts';
import type {
  AnswerResult,
  CurrencyCode,
  Difficulty,
  GameOptions,
  GameState,
  LocalizedCountry,
  Question,
  QuestionKind,
} from '../../src/engine/types.ts';
import { loadCountries, loadFlags } from '../helpers/load-baseline.ts';
import { csQuestions } from '../../src/i18n/questions.cs.ts';

const all = loadCountries();
const flags = loadFlags();
const by = Object.fromEntries(all.map((c) => [c.code, c])) as Record<string, LocalizedCountry<'cs'>>;
const TYPES: QuestionKind[] = [...Core.TYPES, 'flag'];
// The frozen fixture is Czech, so every claim below is a claim about Czech
// questions. `locale-integrity.test.ts` is where both bundles are exercised.
const cs = csQuestions;

const create = (extra: Partial<GameOptions> = {}, seed = 777): GameState =>
  Core.makeGame(
    all,
    { players: 1, difficulty: 'normal', region: 'all', names: ['Anna', 'Petr'], ...extra },
    cs,
    seed,
  );
const current = (g: GameState): Question => g.questions[g.index] as Question;
const answer = (g: GameState, correct = true, elapsed = 5000): AnswerResult =>
  Core.submit(
    g,
    correct ? current(g).correct : (current(g).correct + 1) % 3,
    elapsed,
  ) as AnswerResult;
const step = (g: GameState, correct = true, elapsed = 5000): AnswerResult => {
  const a = answer(g, correct, elapsed);
  Core.advance(g, all, cs);
  return a;
};
/** Loose on purpose: the rejection tests below write values the record forbids. */
const clone = (): Record<string, unknown>[] =>
  JSON.parse(JSON.stringify(all)) as Record<string, unknown>[];
const entry = (list: Record<string, unknown>[], at: number): Record<string, unknown> =>
  list[at] as Record<string, unknown>;

describe('the country database', () => {
  it('passes its own validator, with one flag per country', () => {
    expect(Core.validateCountries(all, cs)).toBe(true);
    expect(all).toHaveLength(195);
    expect(Object.keys(flags)).toHaveLength(195);
  });

  it('names a currency by its monetary unit, not by its nationality', () => {
    expect(Core.currencyLabel({ code: 'MAD' as CurrencyCode }, cs)).toBe('dirham');
    expect(by.MA?.currencyNames[0]?.name.cs).toBe('marocký dirham');
  });

  // The validator is what stands between a bad data refresh (U9) and a build
  // that ships broken questions, and the committed data exercises none of its
  // rejection paths.
  it('rejects a duplicated country code', () => {
    const broken = clone();
    entry(broken, 1).code = entry(broken, 0).code;
    expect(() => Core.validateCountries(broken, cs)).toThrow(/duplicitní kód/);
  });

  it('rejects a country with no capital', () => {
    const broken = clone();
    entry(broken, 0).capital = [];
    expect(() => Core.validateCountries(broken, cs)).toThrow(/chybí capital/);
  });

  it('rejects an unknown region', () => {
    const broken = clone();
    entry(broken, 0).region = 'Atlantis';
    expect(() => Core.validateCountries(broken, cs)).toThrow(/Neznámý region/);
  });

  it('rejects a non-finite population', () => {
    const broken = clone();
    entry(broken, 0).population = Number.POSITIVE_INFINITY;
    expect(() => Core.validateCountries(broken, cs)).toThrow(/obyvatelstvo/);
  });
});

describe('every question variant', () => {
  it('offers three distinct options with a correct answer and an explanation', () => {
    const before = JSON.stringify(all);
    let checked = 0;

    for (const difficulty of ['easy', 'normal', 'expert'] as Difficulty[]) {
      for (let seed = 0; seed < 4; seed += 1) {
        for (const c of all) {
          for (const type of TYPES) {
            const q = Core.makeQuestion(c, type, all, cs, difficulty, Core.rng(seed));
            expect(q.options).toHaveLength(3);
            expect(new Set(q.options).size).toBe(3);
            expect(q.correct).toBeGreaterThanOrEqual(0);
            expect(q.correct).toBeLessThan(3);
            expect(q.explanation).toBeTruthy();

            if (type === 'currency') {
              const valid = new Set(c.currencyNames.map((n) => Core.currencyLabel(n, cs)));
              q.options.forEach((option, i) => {
                expect(valid.has(option)).toBe(i === q.correct);
                expect(/[A-Z]| · |\(|\)/.test(option)).toBe(false);
                expect(Object.values(cs.currencyUnits)).toContain(option);
              });
              for (const n of c.currencyNames) {
                expect(q.explanation).toContain(n.name.cs);
                expect(q.explanation).toContain(n.code);
              }
            }
            if (type === 'flag') {
              q.options.forEach((name, i) => {
                if (i === q.correct) return;
                const other = all.find((x) => x.name.cs === name) as LocalizedCountry<'cs'>;
                expect(Core.sameFlagFamily(c.code, other.code)).toBe(false);
              });
            }
            if (type === 'population') {
              expect(q.options[q.correct]).toBe(Core.populationLabel(c.population, cs));
            }
            checked += 1;
          }
        }
      }
    }

    expect(checked).toBe(14040);
    // The engine must treat the database as read-only: the live build hands it
    // the very array parsed out of the page.
    expect(JSON.stringify(all)).toBe(before);
  });

  it('never offers a second option from the same currency family', () => {
    expect(
      Core.makeQuestion(by.CZ!, 'currency', all, cs).options.filter((x) => x === 'koruna'),
    ).toHaveLength(1);
    expect(
      Core.makeQuestion(by.US!, 'currency', all, cs).options.filter((x) => x === 'dolar'),
    ).toHaveLength(1);
  });
});

describe('every playable configuration', () => {
  it('builds the same game twice from one seed, and never writes to the database', () => {
    const before = JSON.stringify(all);
    const g = create();
    const h = create();

    // `created` is the single non-reproducible field: a wall-clock stamp that
    // two calls a millisecond apart disagree on.
    expect({ ...g, created: '' }).toEqual({ ...h, created: '' });
    expect(JSON.stringify(all)).toBe(before);
  });

  it('deals the same deck twice and keeps the attempt ledger exact for 130 questions', () => {
    let configurations = 0;

    for (const difficulty of ['easy', 'normal', 'expert'] as Difficulty[]) {
      for (const region of ['all' as const, ...Core.REGIONS]) {
        for (const players of [1, 2]) {
          const g = create({ difficulty, region, players });
          const h = create({ difficulty, region, players });
          expect(g.questions).toEqual(h.questions);
          expect(g.version).toBe(7);
          expect(g.lives).toEqual(players === 1 ? [4] : [4, 5]);
          expect(Core.advance(g, all, cs)).toBe(false);

          const paid = Array<number>(players).fill(0);
          const bonusWon = Array<number>(players).fill(0);
          for (let i = 0; i < 130; i += 1) {
            const q = current(g);
            if (region !== 'all') expect(by[q.country]?.region).toBe(region);
            if (difficulty === 'easy') expect(by[q.country]?.easy).toBe(true);
            expect(Core.needsFlight(g)).toBe(q.type === 'country' || q.type === 'flag');
            if (q.type === 'country') {
              paid[q.player] = (paid[q.player] as number) + 1;
              expect(q.countryCost).toBe(1);
            }
            if (q.type === 'flag') {
              const regular = g.questions[q.regularIndex as number] as Question;
              expect(regular.type).toBe('population');
              expect(regular.visit).toBe(q.visit);
              bonusWon[q.player] = (bonusWon[q.player] as number) + 1;
            }

            const a = answer(g, true, 0);
            const copy = JSON.stringify(g);
            // A second submission on the same index must be inert, not additive.
            expect(Core.submit(g, q.correct, 0)).toBeNull();
            expect(JSON.stringify(g)).toBe(copy);
            expect(a.points).toBe(1000);
            expect(a.lifeDelta).toBe(a.scoreLifeDelta + a.flagLifeDelta);
            for (let p = 0; p < players; p += 1) {
              expect(g.lives[p]).toBe(
                5 -
                  (paid[p] as number) +
                  2 * Math.floor((g.scores[p] as number) / 10000) +
                  (bonusWon[p] as number),
              );
            }
            if (i % 15 === 0) expect(Core.validateProgress(g)).toBe(true);
            expect(Core.advance(g, all, cs)).toBe(true);
          }

          expect(Core.validateProgress(g)).toBe(true);
          configurations += 1;
        }
      }
    }

    expect(configurations).toBe(42);
  });
});

describe('the attempt economy', () => {
  it('spends five attempts over 25 questions, not over five wrong answers', () => {
    // The paid last country stays playable even once the reserve is empty.
    const g = create();
    for (let i = 0; i < 25; i += 1) {
      const before = g.lives[0] as number;
      const a = answer(g, false);
      expect(a.lifeDelta).toBe(0);
      expect(g.lives[0]).toBe(before);
      expect(before).toBe(4 - Math.floor(i / 5));
      expect(g.gameOver).toBe(i === 24);
      expect(Core.advance(g, all, cs)).toBe(i < 24);
    }
    expect(g.completed && g.gameOver).toBe(true);
    expect(g.questions).toHaveLength(25);
    expect(Core.validateProgress(g)).toBe(true);
  });

  it('does not debit an attempt for a timed-out regular question either', () => {
    const g = create();
    for (let i = 0; i < 5; i += 1) {
      const a = Core.submit(g, null, 20000) as AnswerResult;
      expect(a.lifeDelta).toBe(0);
      expect(g.lives[0]).toBe(4);
      if (i < 4) Core.advance(g, all, cs);
    }
    Core.advance(g, all, cs);
    expect(g.lives[0]).toBe(3);
  });

  it('credits a milestone immediately without interrupting the country', () => {
    const g = create();
    for (let i = 0; i < 12; i += 1) step(g);
    expect(g.scores[0]).toBe(9360);
    expect(current(g).type).toBe('currency');

    let a = answer(g);
    expect(a.milestoneThresholds).toEqual([10000]);
    expect(a.scoreLifeDelta).toBe(2);
    expect(g.lives[0]).toBe(4);
    expect(Core.nextTurn(g).kind).toBe('question');
    expect(g.pendingBonuses).toEqual([[10000]]);
    expect(Core.validateProgress(g)).toBe(true);

    // Advancing a restored save must land on the same next question.
    const saved = JSON.parse(JSON.stringify(g)) as GameState;
    Core.advance(g, all, cs);
    Core.advance(saved, all, cs);
    expect(g).toEqual(saved);

    for (let i = 0; i < 2; i += 1) step(g);
    expect(current(g).type).toBe('flag');
    expect(g.scores[0]).toBe(11700);
    expect(Core.needsFlight(g)).toBe(true);

    const before = g.lives[0] as number;
    const scoreBefore = g.scores[0] as number;
    a = answer(g);
    expect(g.lives[0]).toBe(before + 1);
    expect(a.flagLifeDelta).toBe(1);
    expect(a.scoreLifeDelta).toBe(0);
    expect(a.points).toBe(780);
    expect(g.scores[0]).toBe(scoreBefore + 780);
    expect(a.basePoints).toBe(100);
    expect(a.bonusPoints).toBe(680);

    Core.advance(g, all, cs);
    expect(current(g).type).toBe('country');
    expect(g.lives[0]).toBe(before);
    expect(g.countriesPlayed[0]).toBe(4);
  });

  it('issues one bonus per threshold on the exact 10,000 boundary, restore or not', () => {
    for (const timeout of [false, true]) {
      const g = create();
      for (let i = 0; i < 10; i += 1) step(g, true, 0);
      expect(current(g).type).toBe('flag');
      expect(g.lives[0]).toBe(5);
      expect(current(g).bonusThreshold).toBe(10000);
      expect(g.scores[0]).toBe(10000);
      expect(g.scoreLives[0]).toBe(2);
      expect(g.bonusMilestones[0]).toBe(1);

      const restore = JSON.parse(JSON.stringify(g)) as GameState;
      expect(Core.validateProgress(restore)).toBe(true);
      for (const run of [g, restore]) {
        if (timeout) Core.submit(run, null, 20000);
        else answer(run, false);
        Core.advance(run, all, cs);
      }
      expect(g).toEqual(restore);
      expect(g.lives[0]).toBe(4);
      expect(g.bonusIssued).toEqual([1]);
      expect(Core.nextBonusThreshold(g, 0)).toBe(20000);
    }
  });

  it('lets a paid country finish at zero reserve, and rescues on the threshold', () => {
    const g = create();
    for (let i = 0; i < 20; i += 1) step(g, i < 9, 0);
    expect(g.scores[0]).toBe(9000);
    expect(g.lives[0]).toBe(0);
    expect(current(g).type).toBe('country');

    const a = answer(g, true, 0);
    expect(a.scoreLifeDelta).toBe(2);
    expect(g.lives[0]).toBe(2);
    expect(Core.nextTurn(g).kind).toBe('question');

    for (let i = 0; i < 4; i += 1) {
      Core.advance(g, all, cs);
      answer(g, false);
    }
    Core.advance(g, all, cs);
    expect(current(g).type).toBe('flag');
    expect(g.gameOver).toBe(false);
  });

  it('awards two lives per threshold but only one queued flag per threshold', () => {
    const bulk = Core.createEconomy(1);
    expect(Core.awardPoints(bulk, 0, 35000)).toEqual([10000, 20000, 30000]);
    expect(bulk.lives[0]).toBe(11);
    expect(bulk.scoreLives[0]).toBe(6);
    expect(bulk.pendingBonuses).toEqual([[10000, 20000, 30000]]);
    expect(Core.awardPoints(bulk, 0, 0)).toEqual([]);
    expect(bulk.lives[0]).toBe(11);
  });

  it('counts the points from a bonus answer toward the next threshold', () => {
    const ledger = Core.createEconomy(1);
    Core.awardPoints(ledger, 0, 19000);
    Core.consumeBonus(ledger, 0);
    const lifeBefore = ledger.lives[0] as number;

    expect(Core.awardPoints(ledger, 0, 1000)).toEqual([20000]);
    Core.awardFlagAttempt(ledger, 0);
    expect((ledger.lives[0] as number) - lifeBefore).toBe(3);
    expect(ledger.lives[0]).toBe(10);
    expect(ledger.pendingBonuses).toEqual([[20000]]);
    expect(ledger.scoreLives[0]).toBe(4);
    expect(ledger.flagLives[0]).toBe(1);
    expect(ledger.earnedLives[0]).toBe(5);

    expect(() => Core.awardPoints(ledger, 0, -1)).toThrow(RangeError);
    expect(() => Core.awardPoints(ledger, 0, 1.5)).toThrow(RangeError);
  });

  it('keeps thresholds, scores, country entries and bonuses per player in a duel', () => {
    let g = create({ players: 2 });
    for (let i = 0; i < 15; i += 1) step(g, i < 5 || i >= 10, 0);
    expect(current(g).type).toBe('flag');
    expect(current(g).player).toBe(0);
    expect(g.scores).toEqual([10000, 0]);
    expect(g.lives).toEqual([5, 4]);
    expect(g.scoreLives).toEqual([2, 0]);
    step(g, false);
    expect(current(g).player).toBe(1);
    expect(g.lives).toEqual([5, 3]);

    g = create({ players: 2 });
    while (!g.completed) {
      answer(g, false);
      Core.advance(g, all, cs);
    }
    expect(g.questions).toHaveLength(50);
    expect(g.countriesPlayed).toEqual([5, 5]);
    expect(g.lives).toEqual([0, 0]);
  });
});

describe('the complete engine, driven end to end', () => {
  interface EngineReport {
    countries: number;
    bonuses: number;
    answers: number;
    score: number;
    reserveAttempts: number;
    seed: number;
    pattern: boolean;
    answerMs: number;
    completed: boolean;
  }

  function actualEngine({
    cap = 2000,
    elapsed = 5000,
    seed = 71007,
    pattern = false,
  }): { game: GameState; report: EngineReport } {
    const game = create({ region: 'Oceania', difficulty: 'normal' }, seed);
    const random = Core.rng(seed);
    let countries = 0;
    let bonuses = 0;
    let regulars = 0;
    const seen: string[] = [];

    while (!game.completed) {
      const q = current(game);
      if (q.type === 'country') {
        countries += 1;
        seen.push(q.country);
      }
      const n = q.type === 'flag' ? bonuses++ : regulars++;
      answer(game, pattern ? n % 5 !== 4 : random() < 0.8, elapsed);
      if (countries >= cap && Core.nextTurn(game).kind === 'country') break;
      Core.advance(game, all, cs);
    }

    expect(Core.validateProgress(game)).toBe(true);
    // No country is ever drawn twice in a row, even across a reshuffle.
    expect(seen.every((code, i) => !i || code !== seen[i - 1])).toBe(true);
    expect(game.lives[0]).toBe(
      5 - countries + 2 * Math.floor((game.scores[0] as number) / 10000) + (game.flagLives[0] as number),
    );

    return {
      game,
      report: {
        countries,
        bonuses,
        answers: game.answers.length,
        score: game.scores[0] as number,
        reserveAttempts: game.lives[0] as number,
        seed,
        pattern,
        answerMs: elapsed,
        completed: game.completed,
      },
    };
  }

  const slow = actualEngine({ elapsed: 5000, cap: 10000 });
  const fast = actualEngine({ elapsed: 3000, pattern: true, cap: 2000 });

  it('runs a five-second player out of attempts', () => {
    expect(slow.game.gameOver).toBe(true);
    expect(slow.game.lives[0]).toBe(0);
    expect(slow.report).toEqual({
      countries: 18,
      bonuses: 5,
      answers: 95,
      score: 57720,
      reserveAttempts: 0,
      seed: 71007,
      pattern: false,
      answerMs: 5000,
      completed: true,
    });
  });

  it('lets a three-second player survive 2,000 countries and reshuffle the deck', () => {
    expect(fast.report.countries).toBe(2000);
    expect(fast.game.lives[0]).toBeGreaterThan(5);
    expect(fast.game.cycles).toBeGreaterThan(10);
    expect(fast.report).toEqual({
      countries: 2000,
      bonuses: 748,
      answers: 10748,
      score: 7481130,
      reserveAttempts: 100,
      seed: 71007,
      pattern: true,
      answerMs: 3000,
      completed: false,
    });
  });

  it('refuses a save whose ledger has been edited or whose version is old', () => {
    const tampered = JSON.parse(JSON.stringify(fast.game)) as GameState;
    tampered.lives[0] = (tampered.lives[0] as number) + 1;
    expect(Core.validateProgress(tampered)).toBe(false);

    // A score is replayed out of the stored answers, so inflating it cannot hold.
    const inflated = JSON.parse(JSON.stringify(fast.game)) as GameState;
    inflated.scores[0] = (inflated.scores[0] as number) + 10;
    expect(Core.validateProgress(inflated)).toBe(false);

    const oldVersion = JSON.parse(JSON.stringify(fast.game)) as GameState;
    oldVersion.version = 6;
    expect(Core.validateProgress(oldVersion)).toBe(false);
  });
});
