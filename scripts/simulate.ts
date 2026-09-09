/**
 * Reproducible Monte Carlo model — a port of the archived `tests/simulate.js`.
 *
 * It drives the same economic functions the game does, so the two must agree:
 * `tests/unit/simulation.test.ts` runs 48 differential comparisons against the
 * full engine on every commit. Batching the ordinary answers of a prepaid
 * country is equivalent at its end — no further attempt can be debited there,
 * and flags never interrupt a country.
 *
 * The full sweep is a 61-second job and stays out of CI; `npm run simulate`
 * runs it and writes the report `docs/data/simulation-results.json` holds.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCore } from '../tests/helpers/load-baseline.ts';

const Core = loadCore();

export interface SimulationSettings {
  trials?: number;
  capCountries?: number;
  regularP?: number;
  flagP?: number;
  elapsedMs?: number;
  timeRangeMs?: [number, number] | null;
  seed?: number;
  label?: string;
}

const DEFAULTS = {
  trials: 10000,
  capCountries: 10000,
  regularP: 0.8,
  flagP: 0.8,
  elapsedMs: 5000,
  timeRangeMs: null as [number, number] | null,
  seed: 7100007,
};

type Config = typeof DEFAULTS & { label?: string };

export interface Expectation {
  meanPointsPerCorrect: number;
  ordinaryPointsPerCountry: number;
  flagPointsPerBonus: number;
  bonusQuestionsPerCountry: number;
  attemptIncomePerCountry: number;
  netReservePerCountry: number;
  breakEvenFlagAccuracy: number;
}

export interface DeathSample {
  run: number;
  countries: number;
  score: number;
}

export interface SimulationResult extends Config {
  pointsPerCorrect: number | null;
  expectation: Expectation;
  survived: number;
  deaths: number;
  survivalPercent: number;
  survivalWilson95Percent: [number, number];
  checkpoints: Record<string, number>;
  totalCountries: number;
  regularAnswers: number;
  regularCorrect: number;
  observedRegularAccuracy: number;
  flagAnswers: number;
  flagCorrect: number;
  observedFlagAccuracy: number | null;
  regularPoints: number;
  flagPoints: number;
  totalScore: number;
  totalReserve: number;
  scoreAttemptAwards: number;
  observedMeanPointsPerCorrect: number;
  meanReserveAmongSurvivors: number | null;
  medianReserveAmongSurvivors: number | null;
  minReserveAmongSurvivors: number | null;
  maxReserveAmongSurvivors: number | null;
  meanScoreAmongSurvivors: number | null;
  meanCountriesCappedAtHorizon: number | null;
  medianCountriesCappedAtHorizon: number | null;
  deathsCountriesQuantiles: Record<string, number | null>;
  meanCountriesAmongDeaths: number | null;
  deathSamples: DeathSample[];
}

export interface FixedPatternResult {
  countries: number;
  elapsedMs: number;
  pointsPerCorrect: number;
  regularPattern: string;
  flagPattern: string;
  score: number;
  reserve: number;
  minimumReserve: number;
  flagQuestions: number;
  survivedHorizon: boolean;
}

function quantile(sorted: readonly number[], p: number): number | null {
  if (!sorted.length) return null;
  const x = (sorted.length - 1) * p;
  const lo = Math.floor(x);
  const hi = Math.ceil(x);
  return (sorted[lo] as number) + ((sorted[hi] as number) - (sorted[lo] as number)) * (x - lo);
}

function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

export function averagePoints({
  elapsedMs,
  timeRangeMs,
}: {
  elapsedMs?: number;
  timeRangeMs?: [number, number] | null;
}): number {
  if (!timeRangeMs) return Core.pointsForTime(elapsedMs ?? Number.NaN, Core.TIME_LIMITS.normal);
  // Exact integration of score-rounding intervals against uniform response times.
  const [lo, hi] = timeRangeMs;
  const limit = Core.TIME_LIMITS.normal;
  const scale = (Core.MAX_POINTS - Core.BASE_POINTS) / 10;
  const cuts = [lo, hi];
  for (let k = 0; k < scale; k += 1) {
    const t = limit * (1 - (k + 0.5) / scale);
    if (t > lo && t < hi) cuts.push(t);
  }
  cuts.sort((a, b) => a - b);
  let total = 0;
  for (let i = 1; i < cuts.length; i += 1) {
    const right = cuts[i] as number;
    const left = cuts[i - 1] as number;
    total += (right - left) * Core.pointsForTime((right + left) / 2, limit);
  }
  return total / (hi - lo);
}

export function expectation(settings: SimulationSettings): Expectation {
  const c: Config = { ...DEFAULTS, ...settings };
  const P = averagePoints(c);
  const ordinary = 5 * c.regularP * P;
  const flags = ordinary / (Core.BONUS_INTERVAL - c.flagP * P);
  const income = flags * (Core.MILESTONE_LIVES + c.flagP);
  return {
    meanPointsPerCorrect: P,
    ordinaryPointsPerCountry: ordinary,
    flagPointsPerBonus: c.flagP * P,
    bonusQuestionsPerCountry: flags,
    attemptIncomePerCountry: income,
    netReservePerCountry: income - 1,
    breakEvenFlagAccuracy: (Core.BONUS_INTERVAL - Core.MILESTONE_LIVES * ordinary) / (ordinary + P),
  };
}

export function simulate(settings: SimulationSettings = {}): SimulationResult {
  const c: Config = { ...DEFAULTS, ...settings };
  for (const key of ['trials', 'capCountries'] as const) {
    if (!Number.isSafeInteger(c[key]) || c[key] < 1) throw new RangeError(key);
  }
  for (const key of ['regularP', 'flagP'] as const) {
    if (!(c[key] >= 0 && c[key] <= 1)) throw new RangeError(key);
  }
  if (
    c.timeRangeMs &&
    !(
      c.timeRangeMs.length === 2 &&
      c.timeRangeMs[0] >= 0 &&
      c.timeRangeMs[0] < c.timeRangeMs[1] &&
      c.timeRangeMs[1] < Core.TIME_LIMITS.normal
    )
  ) {
    throw new RangeError('timeRangeMs');
  }

  const fixedPoints = Core.pointsForTime(c.elapsedMs, Core.TIME_LIMITS.normal);
  const survivorLives: number[] = [];
  const deathCountries: number[] = [];
  const cappedCountries: number[] = [];
  const deathSamples: DeathSample[] = [];
  const checkpoints: Record<string, number> = Object.fromEntries(
    [5, 10, 25, 50, 100, 250, 500, 1000, 10000]
      .filter((n) => n <= c.capCountries)
      .map((n) => [n, 0]),
  );
  let survived = 0;
  let regularAnswers = 0;
  let regularCorrect = 0;
  let flagAnswers = 0;
  let flagCorrect = 0;
  let totalCountries = 0;
  let regularPoints = 0;
  let flagPoints = 0;
  let totalScore = 0;
  let totalReserve = 0;
  let scoreAttemptAwards = 0;
  let meanSurvivorScore = 0;

  for (let run = 0; run < c.trials; run += 1) {
    const random = Core.rng((c.seed + Math.imul(run, 0x9e3779b9)) >>> 0);
    const g = Core.createEconomy(1);
    const range = c.timeRangeMs;
    const responsePoints = range
      ? () => Core.pointsForTime(range[0] + random() * (range[1] - range[0]), Core.TIME_LIMITS.normal)
      : () => fixedPoints;
    let completed = 0;
    while (completed < c.capCountries && Core.spendCountryAttempt(g, 0)) {
      let countryPoints = 0;
      for (let q = 0; q < 5; q += 1) {
        if (random() < c.regularP) {
          regularCorrect += 1;
          countryPoints += responsePoints();
        }
      }
      regularAnswers += 5;
      regularPoints += countryPoints;
      Core.awardPoints(g, 0, countryPoints);
      while ((g.pendingBonuses[0] as number[]).length) {
        Core.consumeBonus(g, 0);
        flagAnswers += 1;
        if (random() < c.flagP) {
          flagCorrect += 1;
          const pts = responsePoints();
          flagPoints += pts;
          Core.awardPoints(g, 0, pts);
          Core.awardFlagAttempt(g, 0);
        }
      }
      completed += 1;
      const reached = checkpoints[completed];
      if (reached !== undefined && (g.lives[0] as number) > 0) {
        checkpoints[completed] = reached + 1;
      }
    }
    if (
      g.lives[0] !==
      Core.INITIAL_LIVES -
        completed +
        Core.MILESTONE_LIVES * Math.floor((g.scores[0] as number) / Core.BONUS_INTERVAL) +
        (g.flagLives[0] as number)
    ) {
      throw new Error('Attempt ledger mismatch');
    }
    if (g.bonusIssued[0] !== g.bonusMilestones[0] || (g.pendingBonuses[0] as number[]).length) {
      throw new Error('Undrained bonus queue');
    }
    totalCountries += completed;
    totalScore += g.scores[0] as number;
    totalReserve += g.lives[0] as number;
    scoreAttemptAwards += g.scoreLives[0] as number;
    cappedCountries.push(completed);
    if (completed === c.capCountries && (g.lives[0] as number) > 0) {
      survived += 1;
      survivorLives.push(g.lives[0] as number);
      meanSurvivorScore += g.scores[0] as number;
    } else {
      deathCountries.push(completed);
      if (deathSamples.length < 20) {
        deathSamples.push({ run, countries: completed, score: g.scores[0] as number });
      }
    }
  }

  for (const arr of [survivorLives, deathCountries, cappedCountries]) arr.sort((a, b) => a - b);
  const p = survived / c.trials;
  const z = 1.959963984540054;
  const den = 1 + (z * z) / c.trials;
  const center = (p + (z * z) / (2 * c.trials)) / den;
  const half =
    (z * Math.sqrt((p * (1 - p)) / c.trials + (z * z) / (4 * c.trials * c.trials))) / den;

  return {
    ...c,
    pointsPerCorrect: c.timeRangeMs ? null : fixedPoints,
    expectation: expectation(c),
    survived,
    deaths: c.trials - survived,
    survivalPercent: 100 * p,
    survivalWilson95Percent: [Math.max(0, (center - half) * 100), Math.min(100, (center + half) * 100)],
    checkpoints,
    totalCountries,
    regularAnswers,
    regularCorrect,
    observedRegularAccuracy: regularCorrect / regularAnswers,
    flagAnswers,
    flagCorrect,
    observedFlagAccuracy: flagAnswers ? flagCorrect / flagAnswers : null,
    regularPoints,
    flagPoints,
    totalScore,
    totalReserve,
    scoreAttemptAwards,
    observedMeanPointsPerCorrect: (regularPoints + flagPoints) / (regularCorrect + flagCorrect),
    meanReserveAmongSurvivors: mean(survivorLives),
    medianReserveAmongSurvivors: quantile(survivorLives, 0.5),
    minReserveAmongSurvivors: survivorLives[0] ?? null,
    maxReserveAmongSurvivors: survivorLives.at(-1) ?? null,
    meanScoreAmongSurvivors: survived ? meanSurvivorScore / survived : null,
    meanCountriesCappedAtHorizon: mean(cappedCountries),
    medianCountriesCappedAtHorizon: quantile(cappedCountries, 0.5),
    deathsCountriesQuantiles: {
      min: deathCountries[0] ?? null,
      p10: quantile(deathCountries, 0.1),
      p25: quantile(deathCountries, 0.25),
      median: quantile(deathCountries, 0.5),
      p75: quantile(deathCountries, 0.75),
      p90: quantile(deathCountries, 0.9),
      p95: quantile(deathCountries, 0.95),
      p99: quantile(deathCountries, 0.99),
      max: deathCountries.at(-1) ?? null,
    },
    meanCountriesAmongDeaths: mean(deathCountries),
    deathSamples,
  };
}

export function fixedPattern(capCountries = 10000, elapsedMs = 5000): FixedPatternResult {
  const g = Core.createEconomy(1);
  const points = Core.pointsForTime(elapsedMs, Core.TIME_LIMITS.normal);
  let completed = 0;
  let flags = 0;
  let minReserve = 5;
  while (completed < capCountries && Core.spendCountryAttempt(g, 0)) {
    minReserve = Math.min(minReserve, g.lives[0] as number);
    Core.awardPoints(g, 0, 4 * points);
    while ((g.pendingBonuses[0] as number[]).length) {
      Core.consumeBonus(g, 0);
      if (flags++ % 5 !== 4) {
        Core.awardPoints(g, 0, points);
        Core.awardFlagAttempt(g, 0);
      }
    }
    completed += 1;
  }
  return {
    countries: completed,
    elapsedMs,
    pointsPerCorrect: points,
    regularPattern: '4 correct then 1 wrong in each country',
    flagPattern: '4 correct then 1 wrong, repeated',
    score: g.scores[0] as number,
    reserve: g.lives[0] as number,
    minimumReserve: minReserve,
    flagQuestions: flags,
    survivedHorizon: completed === capCountries && (g.lives[0] as number) > 0,
  };
}

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const USAGE = 'Usage: node scripts/simulate.ts [--out <file>]';

function main(argv: readonly string[]): void {
  let out = resolve(repoRoot, 'docs/data/simulation-results.json');
  for (let i = 0; i < argv.length; i += 2) {
    const value = argv[i + 1];
    if (value === undefined || argv[i] !== '--out') throw new Error(USAGE);
    out = resolve(value);
  }

  const start = Date.now();
  const mainResult = simulate();
  console.log('MAIN', JSON.stringify(mainResult));
  const settings: SimulationSettings[] = [
    { label: '80 % / exactly 4 s', elapsedMs: 4000, seed: 7104000 },
    { label: '80 % / exactly 3 s', elapsedMs: 3000, seed: 7103000 },
    { label: '80 % / exactly 2 s', elapsedMs: 2000, seed: 7102000 },
    { label: '80 % / uniform 1–5 s', timeRangeMs: [1000, 5000], seed: 7101500 },
    { label: '85 % / exactly 5 s', regularP: 0.85, flagP: 0.85, seed: 7185500 },
    { label: '80 % ordinary, 90 % flags / exactly 5 s', flagP: 0.9, seed: 7180905 },
  ];
  const controls = settings.map((s) => {
    const r = simulate(s);
    console.log(
      'CONTROL',
      s.label,
      JSON.stringify({
        survived: r.survived,
        median: r.medianCountriesCappedAtHorizon,
        net: r.expectation.netReservePerCountry,
      }),
    );
    return r;
  });
  const report = {
    version: 7,
    method:
      'Seeded independent Bernoulli outcomes. Standard 20-second limit, five initial attempts, one per country; two per 10000 points; one per correct flag plus its score. No artificial rescues.',
    main: mainResult,
    controls,
    fixedPatterns: [fixedPattern(), fixedPattern(10000, 3000)],
    runtimeMs: Date.now() - start,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('SAVED', `${report.runtimeMs} ms`, JSON.stringify(report.fixedPatterns));
}

const invoked = process.argv[1];
if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
