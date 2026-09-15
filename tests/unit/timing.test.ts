/**
 * U3 — port of the archived `tests/timing.test.js`, driving the U4 engine.
 *
 * Scoring is the one part of the engine a player can feel to the millisecond,
 * so the curve is pinned at its anchors and swept exhaustively rather than
 * spot-checked: the original walked 6,203 samples and this keeps that number
 * as an assertion, since a changed step size would otherwise pass silently.
 */
import { describe, expect, it } from 'vitest';
import * as Core from '../../src/engine/core.ts';
import { GeoClock as Clock } from '../../src/engine/clock.ts';
import type { Difficulty, GameState } from '../../src/engine/types.ts';
import { loadCountries } from '../helpers/load-baseline.ts';
import { csQuestions } from '../../src/i18n/questions.cs.ts';

const data = loadCountries();
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'expert'];

const game = (difficulty: Difficulty): GameState =>
  Core.makeGame(data, { difficulty, players: 2, region: 'all', names: ['A', 'B'] }, csQuestions, 7);

describe('the time-to-points curve', () => {
  it('anchors 1000 at zero, 550 at half and 0 at the limit, for every difficulty', () => {
    for (const difficulty of DIFFICULTIES) {
      const limit = Core.TIME_LIMITS[difficulty];
      expect(Core.pointsForTime(0, limit)).toBe(1000);
      expect(Core.pointsForTime(limit / 2, limit)).toBe(550);
      expect(Core.pointsForTime(limit, limit)).toBe(0);
    }
  });

  it('never rises and always lands on a multiple of ten across 6,203 samples', () => {
    let samples = 0;
    for (const difficulty of DIFFICULTIES) {
      const limit = Core.TIME_LIMITS[difficulty];
      let last = Infinity;
      for (let elapsed = 0; elapsed <= limit; elapsed += 10) {
        const score = Core.pointsForTime(elapsed, limit);
        expect(score).toBeLessThanOrEqual(last);
        expect(score % 10).toBe(0);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1000);
        last = score;
        samples += 1;
      }
    }
    expect(samples).toBe(6203);
  });

  it('pays 780 for a five-second answer and a flat 100 with no limit at all', () => {
    expect(Core.pointsForTime(5000, 20000)).toBe(780);
    expect(Core.pointsForTime(0, 0)).toBe(100);
  });

  it('refuses a non-finite or negative elapsed time', () => {
    expect(() => Core.pointsForTime(Number.NaN, 1000)).toThrow(RangeError);
    expect(() => Core.pointsForTime(-1, 1000)).toThrow(RangeError);
  });
});

describe('submitting an answer against the clock', () => {
  it('splits the award into base and time bonus and refuses a second submission', () => {
    for (const difficulty of DIFFICULTIES) {
      const limit = Core.TIME_LIMITS[difficulty];
      const g = game(difficulty);
      const q = g.questions[0] as { correct: number };
      const a = Core.submit(g, q.correct, limit / 2);

      expect([a?.points, a?.basePoints, a?.bonusPoints, a?.timedOut]).toEqual([550, 100, 450, false]);
      expect(g.scores).toEqual([550, 0]);
      expect(Core.submit(g, q.correct, 0)).toBeNull();
    }
  });

  it('scores an expiry at zero without debiting an attempt', () => {
    for (const difficulty of DIFFICULTIES) {
      const g = game(difficulty);
      const a = Core.submit(g, null, Core.TIME_LIMITS[difficulty]);

      expect(a?.points).toBe(0);
      expect(a?.lifeDelta).toBe(0);
      expect(a?.timedOut).toBe(true);
      expect(g.lives).toEqual([4, 5]);
    }
  });

  it('rejects an unexpired null answer and an impossible elapsed time', () => {
    for (const difficulty of DIFFICULTIES) {
      const g = game(difficulty);
      expect(() => Core.submit(g, null, 1)).toThrow(RangeError);
      expect(() => Core.submit(g, 0, -1)).toThrow(RangeError);
      expect(() => Core.submit(g, 0, Number.NaN)).toThrow(RangeError);
    }
  });
});

describe('the per-question clock', () => {
  it('accumulates only while running and stops dead at the limit', () => {
    let now = 1000;
    const clock = new Clock(20000, 1000, () => now);

    clock.start();
    now += 1000;
    expect(clock.elapsed()).toBe(2000);

    clock.pause();
    now += 100000;
    expect(clock.elapsed()).toBe(2000);

    clock.start();
    now += 300;
    expect(clock.remaining()).toBe(17700);
    clock.pause();

    // A resumed clock is reconstructed from the stored elapsed time, not from
    // wall time, which is what makes a save survive a reload.
    const restored = new Clock(20000, clock.elapsed(), () => now);
    expect(restored.remaining()).toBe(17700);

    restored.start();
    now += 50000;
    expect(restored.elapsed()).toBe(20000);
    restored.pause().start();
    expect(restored.running).toBe(false);
  });

  it('refuses a negative limit', () => {
    expect(() => new Clock(-1)).toThrow(RangeError);
  });
});
