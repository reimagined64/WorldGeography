/**
 * U5 — the ported synthesizer, measured where a browser is not needed.
 *
 * Composition and transition checks only: what the synthesizer *schedules* is
 * asserted here by intercepting `note`, while what it *sounds like* is pinned
 * by `audio-golden.json` in `tests/browser/audio.spec.ts`, which needs a real
 * `OfflineAudioContext`. The two are complementary — the note stream would not
 * notice a changed envelope or filter, and the spectral digest would not
 * explain which note moved.
 *
 * `note` is the seam on purpose. It is the single point where a scheduled note
 * becomes Web Audio, so replacing it leaves every scene, score and cue running
 * its real arithmetic with nothing stubbed upstream of it.
 */
import { describe, expect, it } from 'vitest';
import { GeoAudio, type Envelope, type SynthContext } from '../../src/audio/audio.ts';
import { rng } from '../../src/engine/core.ts';

const DORIAN = [0, 2, 3, 5, 7, 9, 10];

/** One intercepted call to `note`, in its declared argument order. */
interface RenderedNote {
  midi: number;
  time: number;
  duration: number;
  type: string;
  level: number;
  group: string;
  slide: number | null;
  envelope: Envelope | null;
}

/** Replace the Web Audio sink with a recorder; every check below reads this. */
function recorder(instance: GeoAudio): RenderedNote[] {
  const notes: RenderedNote[] = [];
  instance.note = (
    midi: number,
    time: number,
    duration: number,
    type = 'square',
    level = 0.07,
    group = 'music',
    slide: number | null = null,
    envelope: Envelope | null = null,
  ) => {
    notes.push({ midi, time, duration, type, level, group, slide, envelope });
  };
  return notes;
}

/** A clock with no graph behind it: enough for the scene-transition bookkeeping. */
const clock = (currentTime: number): SynthContext =>
  ({ currentTime }) as unknown as SynthContext;

describe('the quiz groove', () => {
  const a = new GeoAudio();
  const notes = recorder(a);
  /** Sixty-four steps of the current scene, from a clean recorder. */
  const play = (scene: string, steps = 64, beat?: number): RenderedNote[] => {
    a.scene = scene;
    notes.length = 0;
    const duration = beat ?? a.stepDuration();
    for (let step = 0; step < steps; step += 1) a.playStep(step, step * duration);
    return notes;
  };

  it('runs eight articulated bars of C Dorian at 108 BPM', () => {
    a.scene = 'question';
    expect(a.stepDuration()).toBe(60 / 108 / 2);
    expect(GeoAudio.QUESTION_SCORE.bpm).toBe(108);
    expect(GeoAudio.QUESTION_SCORE.key).toBe('C Dorian');
    expect(GeoAudio.QUESTION_SCORE.lead).toHaveLength(64);

    play('question');

    expect(notes.length).toBeGreaterThan(160);
    expect(notes.length).toBeLessThan(320);
    // No drones or pads: long notes would sit under the question text.
    expect(notes.every((n) => n.duration < 0.35 && n.duration > 0)).toBe(true);
    expect(notes.every((n) => DORIAN.includes(n.midi % 12))).toBe(true);
    expect(notes.some((n) => n.midi % 12 === 9)).toBe(true);
    expect(notes.some((n) => n.midi % 12 === 3)).toBe(true);
  });

  it('keeps the bass audible above the old sub-bass range', () => {
    const bass = play('question').filter((n) => n.type === 'triangle' && n.level >= 0.13);
    expect(bass).toHaveLength(40);
    expect(bass.every((n) => n.midi >= 43 && n.midi <= 65)).toBe(true);
  });

  it('ignores transposition, so every country shares one tonal home', () => {
    const first = JSON.stringify(play('question'));
    a.transpose = 7;
    const transposed = JSON.stringify(play('question'));
    a.transpose = 0;
    expect(transposed).toBe(first);
  });

  it('adds an urgency pulse at 120 BPM without lengthening a note', () => {
    a.scene = 'urgent';
    expect(a.stepDuration()).toBe(0.25);
    play('urgent', 64, 0.25);

    expect(notes.filter((n) => n.duration === 0.07 && n.midi === 79)).toHaveLength(32);
    expect(notes.every((n) => n.duration < 0.35)).toBe(true);
  });

  it('answers with a rising or falling cue in the same open harmony', () => {
    for (const kind of ['correct', 'wrong', 'timeout']) {
      notes.length = 0;
      a.scheduleCue(kind, 1);
      const lead = notes.filter((n) => n.type === 'square');

      expect(notes.every((n) => n.group === 'effects' && n.level <= 0.13)).toBe(true);
      expect(notes.every((n) => [0, 2, 5, 7].includes(n.midi % 12))).toBe(true);
      expect(Math.max(...notes.map((n) => n.time + n.duration)) - 1).toBeLessThan(0.7);
      for (let i = 1; i < lead.length; i += 1) {
        const previous = lead[i - 1] as RenderedNote;
        const note = lead[i] as RenderedNote;
        expect(kind === 'correct' ? note.midi > previous.midi : note.midi < previous.midi).toBe(true);
      }
    }
  });

  it('keeps playing on the menu, in flight and during a bonus', () => {
    for (const scene of ['home', 'flight', 'bonus']) {
      expect(play(scene, 32).length).toBeGreaterThan(0);
    }
  });
});

describe('scene transitions', () => {
  it('changes tempo without cutting the phrase, and clears music for feedback', () => {
    const transition = new GeoAudio();
    transition.context = clock(17);
    transition.scene = 'question';
    transition.step = 19;
    transition.nextTime = 17.1;
    transition.applyTimbre = () => {};
    transition.runScheduler = () => {};
    let cuts = 0;
    transition.stopVoices = () => {
      cuts += 1;
    };

    transition.setScene('urgent');
    expect(transition.step).toBe(19);
    expect(transition.nextTime).toBe(17.1);
    expect(cuts).toBe(0);

    transition.setScene('feedback');
    expect(cuts).toBe(1);
    expect(transition.step).toBe(0);
  });

  it('resumes at the stored step, rescheduled against the live context clock', () => {
    const resumed = new GeoAudio();
    resumed.context = clock(17);
    resumed.paused = true;
    resumed.step = 3;
    resumed.nextTime = 19;
    resumed.applyVolume = () => {};
    let starts = 0;
    resumed.runScheduler = () => {
      starts += 1;
    };

    resumed.setPaused(false);
    expect(resumed.step).toBe(3);
    expect(resumed.nextTime).toBe(17.035);
    expect(starts).toBe(1);
  });
});

describe('the twenty-one themes', () => {
  it('are all distinct, and every one stays inside the Dorian collection', () => {
    expect(GeoAudio.QUESTION_SCORES).toHaveLength(21);
    expect(new Set(GeoAudio.QUESTION_SCORES.map((s) => JSON.stringify(s.lead))).size).toBe(21);

    const a = new GeoAudio();
    const notes = recorder(a);
    for (let id = 0; id < 21; id += 1) {
      a.scoreIndex = id;
      a.scene = 'question';
      notes.length = 0;
      const score = GeoAudio.QUESTION_SCORES[id];
      expect(score?.lead).toHaveLength(id === 0 ? 64 : 128);
      for (let j = 0; j < (score?.lead.length ?? 0); j += 1) a.playStep(j, j * a.stepDuration());

      expect(notes.every((n) => DORIAN.includes(n.midi % 12))).toBe(true);
      expect(notes.every((n) => n.duration < 0.35)).toBe(true);
      expect(notes.every((n) => Number.isFinite(n.midi) && n.duration > 0)).toBe(true);
    }
  });

  it('never repeats a theme or a starting offset back to back over 2,100 selections', () => {
    const shuffled = new GeoAudio({ random: rng(6006) });
    let previous = -1;
    let lastId = -1;
    let selections = 0;

    for (let cycle = 0; cycle < 100; cycle += 1) {
      const seen = new Set<number>();
      for (let i = 0; i < 21; i += 1) {
        const key = `${cycle}:${i}`;
        expect(shuffled.beginQuestion(key)).toBe(true);
        expect(shuffled.questionStartStep).not.toBe(previous);
        expect(shuffled.scoreIndex).not.toBe(lastId);
        previous = shuffled.questionStartStep;
        lastId = shuffled.scoreIndex;
        seen.add(shuffled.scoreIndex);

        // Re-asking the same question must not restart the phrase.
        const position = shuffled.step;
        expect(shuffled.beginQuestion(key)).toBe(false);
        expect(shuffled.step).toBe(position);
        selections += 1;
      }
      // Each cycle is a shuffled bag, so it covers the full set exactly once.
      expect(seen.size).toBe(21);
    }

    expect(selections).toBe(2100);
  });
});
