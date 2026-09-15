/**
 * U3 captured the four fidelity fixtures; U4 turns them on the ported engine.
 *
 * These files, and not byte-identity with the original JavaScript, are what
 * carries v7 fidelity from here on: the engine, the globe and the synthesizer
 * are rewritten in TypeScript and measured against them. So this suite has two
 * jobs — prove `src/engine/core.ts` reproduces the two engine fixtures exactly,
 * entry for entry and step for step, and prove the two browser-captured
 * fixtures are structurally what U5 and U6 will need.
 *
 * A divergence here is a defect in the port. The fixtures are the oracle and
 * are never recaptured from the thing they are measuring.
 *
 * The browser fixtures cannot be regenerated here; `OfflineAudioContext` does
 * not exist in Node, and a real save only exists once the shipped page has
 * written one. `node scripts/capture-golden.ts verify-audio` re-renders and
 * holds `audio-golden.json` to its own tolerance.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as Engine from '../../src/engine/core.ts';
import type { GameState } from '../../src/engine/types.ts';
import {
  bindBundle,
  captureQuestions,
  captureRuns,
  FIXTURES_DIR,
  type GoldenRun,
  type QuestionsGolden,
  type RunsGolden,
} from '../helpers/golden.ts';
import { FLOOR_DB, type AudioGolden } from '../helpers/audio-digest.ts';
import { loadAudio, loadCountries, loadIsValidRun } from '../helpers/load-baseline.ts';
import { csQuestions } from '../../src/i18n/questions.cs.ts';

const all = loadCountries();
// The fixtures are 14,040 Czech questions and 48 Czech runs, so the engine is
// driven with the Czech bundle and nothing else. An English bundle here would
// not be a failing test, it would be a different oracle.
const czech = bindBundle(Engine, csQuestions);
const read = <T>(relative: string): T =>
  JSON.parse(readFileSync(join(FIXTURES_DIR, relative), 'utf8')) as T;

describe('questions-golden.json', () => {
  const golden = read<QuestionsGolden>('questions-golden.json');

  it('holds exactly 14,040 entries', () => {
    expect(golden.entries).toHaveLength(14040);
    expect(golden.version).toBe(7);
  });

  it('regenerates from the TypeScript engine, identically, twice in a row', () => {
    // Two passes because `makeQuestion` takes the RNG as an argument: a port
    // that leaked state between calls would still match on the first pass.
    const first = captureQuestions(czech, all);
    const second = captureQuestions(czech, all);
    const expected = JSON.stringify(golden.entries);

    expect(JSON.stringify(first.entries)).toBe(expected);
    expect(JSON.stringify(second.entries)).toBe(expected);
  });

  it('covers every difficulty, seed, country and type exactly once', () => {
    const keys = new Set(
      golden.entries.map((e) => `${e.difficulty}/${e.seed}/${e.country}/${e.type}`),
    );
    expect(keys.size).toBe(14040);
    expect(new Set(golden.entries.map((e) => e.country)).size).toBe(195);
    expect(new Set(golden.entries.map((e) => e.type)).size).toBe(6);
  });
});

describe('runs-golden.json', () => {
  const golden = read<RunsGolden>('runs-golden.json');

  it('covers all 48 configurations, each reaching a terminal state', () => {
    expect(golden.runs).toHaveLength(48);
    expect(new Set(golden.runs.map((r) => `${r.seed}/${String(r.timeRangeMs)}`)).size).toBe(48);

    for (const run of golden.runs) {
      const terminal = run.terminal as { completed: boolean; gameOver: boolean };
      expect(run.steps.length).toBeGreaterThan(0);
      if (run.terminalReason === 'exhausted') {
        expect(terminal.completed).toBe(true);
        expect(terminal.gameOver).toBe(true);
      } else {
        // The uniform 1-5 s player is profitable, so those runs stop at the cap.
        expect(run.terminalReason).toBe('capped');
        expect(run.counts.countries).toBe(run.capCountries);
      }
    }
  });

  it('stays under 2 MB, so nobody is ever tempted to trim what it records', () => {
    expect(statSync(join(FIXTURES_DIR, 'runs-golden.json')).size).toBeLessThan(2 * 1024 * 1024);
  });

  it('replays step for step against the TypeScript engine', () => {
    // This is the only fixture that notices a reordering of the three RNG
    // consumers in `appendQuestion`, so a mismatch is reported by step number
    // rather than as one opaque object diff.
    const replayed = captureRuns(czech, all);
    expect(replayed.runs).toHaveLength(golden.runs.length);

    for (const [index, expected] of golden.runs.entries()) {
      const actual = replayed.runs[index] as GoldenRun;
      const where = `run ${index} (seed ${expected.seed}, timeRangeMs ${String(expected.timeRangeMs)})`;

      expect(`${where}: ${actual.steps.length} steps`).toBe(`${where}: ${expected.steps.length} steps`);
      const firstDrift = expected.steps.findIndex((hash, step) => actual.steps[step] !== hash);
      expect(`${where}: first drifting step ${firstDrift}`).toBe(`${where}: first drifting step -1`);
      expect(actual.terminalHash).toBe(expected.terminalHash);
      expect(actual.terminalReason).toBe(expected.terminalReason);
      expect(actual.counts).toEqual(expected.counts);
      expect(actual.terminal).toEqual(expected.terminal);
    }
  });

  it('records 19,762 answers in total, the number the original suite reported', () => {
    expect(golden.runs.reduce((sum, run) => sum + run.steps.length, 0)).toBe(19762);
  });
});

describe('real wg.run.v7 payloads', () => {
  const NAMES = ['mid-country', 'mid-flight', 'post-milestone', 'pending-bonus'] as const;
  const saves = new Map(
    NAMES.map((name) => [name, read<GameState>(`baseline/runs/${name}.json`)] as const),
  );
  // The shipped predicate, driven by the ported engine rather than the original.
  const isValidRun = loadIsValidRun(Engine);

  it('captured three to five real saves from the shipped build', () => {
    expect(saves.size).toBeGreaterThanOrEqual(3);
    expect(saves.size).toBeLessThanOrEqual(5);
  });

  // `validateProgress` compares every field of every stored answer with
  // `JSON.stringify`, so adding, removing or renaming one field on a result or
  // a question silently rejects every player's save on their next visit.
  it.each([...saves.keys()])('%s passes isValidRun and validateProgress', (name) => {
    const save = saves.get(name) as GameState;
    expect(isValidRun(save)).toBe(true);
    expect(Engine.validateProgress(save)).toBe(true);
    expect(save.version).toBe(7);
    expect(save.completed).toBe(false);
    expect(save.questions).toHaveLength(save.index + 1);
  });

  it('covers a question mid-country, a flight, a milestone and a pending bonus', () => {
    const midCountry = saves.get('mid-country') as GameState;
    expect(midCountry.questions[midCountry.index]?.type).toBe('capital');
    expect(midCountry.clock?.index).toBe(midCountry.index);

    const midFlight = saves.get('mid-flight') as GameState;
    expect(midFlight.revealedIndex).toBeNull();
    expect(midFlight.clock).toBeNull();
    expect(midFlight.answers).toHaveLength(midFlight.index);

    const postMilestone = saves.get('post-milestone') as GameState;
    expect(postMilestone.answers[postMilestone.index]?.milestoneThresholds).toEqual([10000]);
    expect(postMilestone.answers[postMilestone.index]?.scoreLifeDelta).toBe(2);
    expect(postMilestone.pendingBonuses).toEqual([[10000]]);

    const pendingBonus = saves.get('pending-bonus') as GameState;
    expect(pendingBonus.questions[pendingBonus.index]?.type).toBe('flag');
    expect(pendingBonus.questions[pendingBonus.index]?.bonusThreshold).toBe(10000);
    expect(pendingBonus.pendingBonuses).toEqual([[]]);
  });

  it('is rejected once a single stored field is edited', () => {
    // The point of committing real payloads: prove the gate is this strict.
    const tampered = JSON.parse(JSON.stringify(saves.get('post-milestone'))) as GameState;
    const answer = tampered.answers[tampered.index];
    if (answer === undefined) throw new Error('post-milestone has no current answer');
    delete (answer as unknown as Record<string, unknown>)['isFlagBonus'];

    expect(Engine.validateProgress(tampered)).toBe(false);
    expect(isValidRun(tampered)).toBe(false);
  });
});

describe('audio-golden.json', () => {
  const golden = read<AudioGolden>('audio-golden.json');
  const Audio = loadAudio();

  it('holds one digest per theme, named and sized like the baseline scores', () => {
    expect(golden.themes).toHaveLength(21);
    expect(Audio.QUESTION_SCORES).toHaveLength(21);

    golden.themes.forEach((theme, index) => {
      const score = Audio.QUESTION_SCORES[index];
      expect(theme.index).toBe(index);
      expect(theme.name).toBe(score?.name);
      expect(theme.leadLength).toBe(score?.lead.length);
      expect(theme.stepSeconds).toBeCloseTo(score?.stepSeconds ?? 0, 12);
      expect(theme.notes).toBeGreaterThan(0);
    });
    expect(new Set(golden.themes.map((t) => t.name)).size).toBe(21);
  });

  it('carries a full spectrogram per theme, with audible signal in it', () => {
    for (const theme of golden.themes) {
      expect(theme.spectrum).toHaveLength(golden.frames);
      for (const frame of theme.spectrum) {
        expect(frame).toHaveLength(golden.bandEdgesHz.length - 1);
        expect(frame.every((db) => Number.isFinite(db) && db >= FLOOR_DB && db <= 0)).toBe(true);
      }
      // A synthesizer that emitted silence would still produce a well-shaped
      // fixture, so loudness is asserted rather than assumed.
      expect(theme.rms).toBeGreaterThan(0.001);
      expect(theme.peak).toBeGreaterThan(0.01);
      expect(theme.peak).toBeLessThan(1);
      expect(theme.spectrum.some((frame) => frame.some((db) => db > -60))).toBe(true);
    }
  });

  it('names the browser it was rendered by and the tolerance it may be held to', () => {
    // The digest encodes one Chromium build; U5 compares against it within
    // this tolerance rather than expecting bit-identical rendering.
    expect(golden.browser).toMatch(/^chromium \d+\./);
    expect(golden.tolerance.bandDb).toBeGreaterThan(0);
    expect(golden.tolerance.amplitudeRelative).toBeGreaterThan(0);
    expect(golden.floorDb).toBe(FLOOR_DB);
  });
});
