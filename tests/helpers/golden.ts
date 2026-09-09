/**
 * Shared production of the two engine fixtures, so `scripts/capture-golden.ts`
 * and `tests/unit/golden.test.ts` cannot drift apart: the capture writes what
 * this module computes from the frozen v7 JavaScript, and the test recomputes
 * it from the TypeScript engine and compares. One walk, two engines — which is
 * only a fidelity claim as long as the walk itself is the same code.
 *
 * Both walks reproduce the exact traversal the original `node:assert` suites
 * used — `core.test.js` for the question walk, `simulation.test.js` for the
 * 48 run configurations — because those orders are what the recorded values
 * mean. Changing either order invalidates the fixture.
 */
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type {
  AnswerResult,
  BaseQuestion,
  Country,
  Difficulty,
  GameOptions,
  GameState,
  Question,
  QuestionKind,
  QuestionType,
  Turn,
} from '../../src/engine/types.ts';

/**
 * The slice of the engine both walks drive.
 *
 * Declared here rather than lifted off either module, so one walk can be
 * pointed at the frozen JavaScript — which is how the fixtures were captured —
 * and at the TypeScript port, which is what the suite holds to them.
 */
export interface GoldenEngine {
  readonly TYPES: readonly QuestionType[];
  rng(seed: number): () => number;
  makeQuestion(
    country: Country,
    type: QuestionKind,
    all: Country[],
    difficulty?: Difficulty,
    random?: () => number,
  ): BaseQuestion;
  makeGame(all: Country[], options: GameOptions, seed?: number): GameState;
  submit(game: GameState, selected: number | null, elapsedMs?: number): AnswerResult | null;
  advance(game: GameState, all: Country[]): boolean;
  nextTurn(game: GameState): Turn;
}

export const FIXTURES_DIR = fileURLToPath(new URL('../fixtures', import.meta.url));

/**
 * Order-stable and lossless: keys keep insertion order rather than being
 * sorted, so a port that reorders the fields of a game or a question is caught
 * instead of being normalized away, and `undefined` is written rather than
 * silently dropped the way `JSON.stringify` drops it.
 */
export function canonicalize(value: unknown): string {
  const out: string[] = [];
  write(value, out);
  return out.join('');
}

function write(value: unknown, out: string[]): void {
  if (value === undefined) {
    out.push('undefined');
    return;
  }
  if (value === null) {
    out.push('null');
    return;
  }
  switch (typeof value) {
    case 'string':
      out.push(JSON.stringify(value));
      return;
    case 'boolean':
      out.push(value ? 'true' : 'false');
      return;
    case 'number':
      out.push(Object.is(value, -0) ? '-0' : String(value));
      return;
    case 'bigint':
      out.push(`${value.toString()}n`);
      return;
    default:
      break;
  }
  if (Array.isArray(value)) {
    out.push('[');
    for (let i = 0; i < value.length; i += 1) {
      if (i > 0) out.push(',');
      write(value[i], out);
    }
    out.push(']');
    return;
  }
  if (typeof value !== 'object') throw new TypeError(`Cannot canonicalize a ${typeof value}`);
  out.push('{');
  let first = true;
  for (const [key, entry] of Object.entries(value)) {
    if (!first) out.push(',');
    first = false;
    out.push(JSON.stringify(key), ':');
    write(entry, out);
  }
  out.push('}');
}

export const sha256 = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

/* ------------------------------------------------------------------ *
 * questions-golden.json
 * ------------------------------------------------------------------ */

export interface GoldenQuestion {
  country: string;
  type: QuestionKind;
  difficulty: Difficulty;
  seed: number;
  prompt: string;
  options: string[];
  correct: number;
  explanation: string;
  source: string;
}

export interface QuestionsGolden {
  version: number;
  order: string;
  difficulties: Difficulty[];
  seeds: number[];
  entries: GoldenQuestion[];
}

export const QUESTION_DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'expert'];
export const QUESTION_SEEDS = [0, 1, 2, 3];

/** 3 difficulties x 4 seeds x 195 countries x 6 types, in `core.test.js` order. */
export function captureQuestions(engine: GoldenEngine, all: Country[]): QuestionsGolden {
  const types: QuestionKind[] = [...engine.TYPES, 'flag'];
  const entries: GoldenQuestion[] = [];
  for (const difficulty of QUESTION_DIFFICULTIES) {
    for (const seed of QUESTION_SEEDS) {
      for (const country of all) {
        for (const type of types) {
          const q = engine.makeQuestion(country, type, all, difficulty, engine.rng(seed));
          entries.push({
            country: q.country,
            type: q.type,
            difficulty,
            seed,
            prompt: q.prompt,
            options: q.options,
            correct: q.correct,
            explanation: q.explanation,
            source: q.source,
          });
        }
      }
    }
  }
  return {
    version: 7,
    order: 'difficulty, then seed, then country in data order, then [...TYPES, flag]',
    difficulties: QUESTION_DIFFICULTIES,
    seeds: QUESTION_SEEDS,
    entries,
  };
}

/* ------------------------------------------------------------------ *
 * runs-golden.json
 * ------------------------------------------------------------------ */

export interface RunConfig {
  seed: number;
  timeRangeMs: [number, number] | null;
  capCountries: number;
  elapsedMs: number;
  correctProbability: number;
}

/** The 48 configurations `simulation.test.js` drives the engine through. */
export const RUN_CONFIGS: RunConfig[] = ((): RunConfig[] => {
  const ranges: ([number, number] | null)[] = [null, [1000, 5000]];
  const configs: RunConfig[] = [];
  for (const timeRangeMs of ranges) {
    for (let run = 0; run < 24; run += 1) {
      configs.push({
        seed: 710071 + run,
        timeRangeMs,
        capCountries: 150,
        elapsedMs: 5000,
        correctProbability: 0.8,
      });
    }
  }
  return configs;
})();

/**
 * `makeGame` stamps `new Date().toISOString()`, the one non-reproducible field
 * in the object. Overwriting it with a constant keeps the field present — so a
 * port that drops it still changes every hash — while making the trace
 * deterministic.
 */
export const CREATED_PLACEHOLDER = '2026-09-09T00:00:00.000Z';

export interface FoldedArray {
  length: number;
  digest: string;
}

export interface TerminalArray extends FoldedArray {
  last: unknown;
}

export interface RunCounts {
  countries: number;
  regularAnswers: number;
  regularCorrect: number;
  flagAnswers: number;
  flagCorrect: number;
  totalScore: number;
  totalReserve: number;
  scoreAttemptAwards: number;
}

export interface GoldenRun extends RunConfig {
  steps: string[];
  counts: RunCounts;
  terminalReason: 'exhausted' | 'capped';
  terminalHash: string;
  terminal: Record<string, unknown>;
}

export interface RunsGolden {
  version: number;
  engine: string;
  createdPlaceholder: string;
  stepHash: string;
  terminal: string;
  runs: GoldenRun[];
}

const EMPTY_DIGEST = sha256('');

/**
 * A rolling digest per unbounded array, so each step hash is still a function
 * of the whole game object while costing O(1) instead of O(n) to compute.
 * Hashing the literal object at every step is 3.8 GB of serialization over the
 * 19,762 steps — 43 s, which no per-commit suite can carry.
 */
class ArrayDigest {
  private digest = EMPTY_DIGEST;
  private folded = 0;

  fold(items: readonly unknown[]): void {
    while (this.folded < items.length) {
      this.digest = sha256(this.digest + canonicalize(items[this.folded]));
      this.folded += 1;
    }
  }

  view(items: readonly unknown[]): FoldedArray {
    return { length: items.length, digest: this.digest };
  }

  terminalView(items: readonly unknown[]): TerminalArray {
    return { length: items.length, digest: this.digest, last: items.at(-1) ?? null };
  }
}

/** The game object with its two append-only arrays folded to digests. */
function gameView(
  game: GameState,
  questions: FoldedArray,
  answers: FoldedArray,
): Record<string, unknown> {
  const view: Record<string, unknown> = {};
  for (const key of Object.keys(game)) {
    view[key] =
      key === 'questions' ? questions
      : key === 'answers' ? answers
      : (game as unknown as Record<string, unknown>)[key];
  }
  return view;
}

/**
 * Drive one configuration to its terminal state, recording a hash per answer.
 *
 * The three RNG consumers inside `appendQuestion` share a single `random`, so
 * their order is only observable in the resulting game — not in any single
 * question. That is what these hashes pin.
 */
export function replayRun(engine: GoldenEngine, all: Country[], config: RunConfig): GoldenRun {
  const { seed, timeRangeMs, capCountries, elapsedMs, correctProbability } = config;
  const random = engine.rng(seed);
  const game = engine.makeGame(
    all,
    { players: 1, difficulty: 'normal', region: 'all', names: ['Test'] },
    seed,
  );
  game.created = CREATED_PLACEHOLDER;

  const questionDigest = new ArrayDigest();
  const answerDigest = new ArrayDigest();
  const steps: string[] = [];
  const counts: RunCounts = {
    countries: 1,
    regularAnswers: 0,
    regularCorrect: 0,
    flagAnswers: 0,
    flagCorrect: 0,
    totalScore: 0,
    totalReserve: 0,
    scoreAttemptAwards: 0,
  };
  let terminalReason: 'exhausted' | 'capped' = 'exhausted';

  while (!game.completed) {
    const question = game.questions[game.index] as Question;
    const correct = random() < correctProbability;
    const elapsed =
      correct && timeRangeMs !== null
        ? timeRangeMs[0] + random() * (timeRangeMs[1] - timeRangeMs[0])
        : elapsedMs;
    const result = engine.submit(
      game,
      correct ? question.correct : (question.correct + 1) % 3,
      elapsed,
    ) as AnswerResult;

    if (question.type === 'flag') {
      counts.flagAnswers += 1;
      if (correct) counts.flagCorrect += 1;
    } else {
      counts.regularAnswers += 1;
      if (correct) counts.regularCorrect += 1;
    }

    questionDigest.fold(game.questions);
    answerDigest.fold(game.answers);
    steps.push(
      sha256(
        canonicalize({
          game: gameView(
            game,
            questionDigest.view(game.questions),
            answerDigest.view(game.answers),
          ),
          result,
        }),
      ),
    );

    if (counts.countries === capCountries && engine.nextTurn(game).kind === 'country') {
      terminalReason = 'capped';
      break;
    }
    if (!engine.advance(game, all)) break;
    if ((game.questions[game.index] as Question).type === 'country') counts.countries += 1;
  }

  questionDigest.fold(game.questions);
  answerDigest.fold(game.answers);
  counts.totalScore = game.scores[0] ?? 0;
  counts.totalReserve = game.lives[0] ?? 0;
  counts.scoreAttemptAwards = game.scoreLives[0] ?? 0;

  return {
    ...config,
    steps,
    counts,
    terminalReason,
    // Over the literal object, arrays and all: the one O(n) hash in the run,
    // and the only thing that would notice a retroactive edit of an old entry.
    terminalHash: sha256(canonicalize(game)),
    terminal: gameView(
      game,
      questionDigest.terminalView(game.questions),
      answerDigest.terminalView(game.answers),
    ),
  };
}

export function captureRuns(engine: GoldenEngine, all: Country[]): RunsGolden {
  return {
    version: 7,
    // Provenance of the committed fixture, not of whatever is driving this walk.
    engine: 'tests/fixtures/baseline/js/core.js',
    createdPlaceholder: CREATED_PLACEHOLDER,
    stepHash:
      'sha256 of the canonicalized {game, result} after each submit, with questions and answers folded to rolling digests',
    terminal:
      'terminalHash is sha256 of the canonicalized final game object in full; terminal is that object with the two arrays folded',
    runs: RUN_CONFIGS.map((config) => replayRun(engine, all, config)),
  };
}
