/**
 * What a refresh would change, written for a human to read.
 *
 * The refresh cadence for this project is manual and roughly yearly, so a
 * person reads this report before anything is written. That decides the shape:
 * it is grouped by field rather than by country, because "17 capitals moved" is
 * a reviewable statement and 195 per-country stanzas are not, and it prints the
 * baseline commit it was computed against so a report pasted into a review can
 * be reproduced.
 *
 * The **shadowed** section is the part that does not exist anywhere else. Every
 * override is a position someone took against an upstream value; when upstream
 * moves to agree — or to disagree differently — nothing breaks, the override
 * simply keeps winning, and the curation quietly rots. `mergeCountries` records
 * each suppressed value, and this is where they get read.
 */
import type { LocalizedCountry } from '../../src/engine/types.ts';
import { BASE_LOCALE, type MapPolygon, type ShadowedChange } from './merge.ts';

/**
 * Every country in this report is named once, in the leading locale.
 *
 * A report that printed both names would double the width of every line to say
 * the same thing twice; the field-by-field diff below still compares the whole
 * `LocalizedText`, so a name that moved in English only is still reported — it
 * is simply filed under the Czech name.
 */
const named = (country: LocalizedCountry): string => country.name[BASE_LOCALE];

/** One field of one country, before and after. */
export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface CountryChange {
  code: string;
  name: string;
  fields: FieldChange[];
}

export interface PolygonChange {
  iso3: string;
  before: number;
  after: number;
}

/**
 * A coordinate that moved without the polygon count changing.
 *
 * Counting rings is not enough to review a basemap. Natural Earth could
 * re-generalize every border and still hand back 288 polygons, and the diff
 * would say `+0` while `--accept` rewrote the whole file. The ten coordinates
 * where v7's CPython `round()` broke a half-way tie the other way from
 * `Math.round` are the live example: invisible to a count, and a silent rewrite
 * of `data/build/map.json` if nobody looks.
 */
export interface CoordinateChange {
  iso3: string;
  /** Index of the ring within that country's polygons, then of the point. */
  ring: number;
  point: number;
  before: readonly [number, number];
  after: readonly [number, number];
}

export interface PopulationChange {
  code: string;
  name: string;
  before: number;
  after: number;
  /** Signed relative change. `Infinity` when the baseline had none. */
  ratio: number;
}

export interface DatasetDiff {
  added: LocalizedCountry[];
  removed: LocalizedCountry[];
  changed: CountryChange[];
  population: PopulationChange[];
  polygons: {
    before: number;
    after: number;
    changed: PolygonChange[];
    /** Empty when the geometry is identical; capped, because a re-generalization moves thousands. */
    coordinates: CoordinateChange[];
    /** How many moved in total, however few are listed. */
    coordinateCount: number;
  };
}

/** Fields compared one by one. Order is the order the report prints them in. */
const FIELDS: readonly (keyof LocalizedCountry)[] = [
  'iso3', 'name', 'capital', 'currency', 'currencyNames', 'languages', 'languageNames',
  'excludeLanguages', 'lat', 'lon', 'region', 'population', 'populationYear', 'populationKind',
  'populationSource', 'note', 'easy',
];

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function diffCountries(before: readonly LocalizedCountry[], after: readonly LocalizedCountry[]): DatasetDiff {
  const was = new Map(before.map((country) => [country.code as string, country]));
  const now = new Map(after.map((country) => [country.code as string, country]));

  const added = after.filter((country) => !was.has(country.code as string));
  const removed = before.filter((country) => !now.has(country.code as string));
  const changed: CountryChange[] = [];
  const population: PopulationChange[] = [];

  for (const country of after) {
    const previous = was.get(country.code as string);
    if (previous === undefined) continue;
    const fields = FIELDS.filter((field) => !same(previous[field], country[field])).map(
      (field): FieldChange => ({ field, before: previous[field], after: country[field] }),
    );
    if (fields.length > 0) changed.push({ code: country.code, name: named(country), fields });
    if (previous.population !== country.population) {
      population.push({
        code: country.code,
        name: named(country),
        before: previous.population,
        after: country.population,
        ratio:
          previous.population === 0
            ? Infinity
            : (country.population - previous.population) / previous.population,
      });
    }
  }

  changed.sort((a, b) => a.code.localeCompare(b.code, 'en'));
  population.sort((a, b) => Math.abs(b.ratio) - Math.abs(a.ratio));
  return { added, removed, changed, population, polygons: { before: 0, after: 0, changed: [], coordinates: [], coordinateCount: 0 } };
}

/**
 * What moved in the basemap: polygon counts per country, and then the
 * coordinates themselves where the two sides still line up.
 */
export function diffPolygons(
  before: readonly MapPolygon[],
  after: readonly MapPolygon[],
): DatasetDiff['polygons'] {
  const count = (polygons: readonly MapPolygon[]): Map<string, number> => {
    const out = new Map<string, number>();
    for (const polygon of polygons) out.set(polygon.iso3, (out.get(polygon.iso3) ?? 0) + 1);
    return out;
  };
  const was = count(before);
  const now = count(after);
  const changed: PolygonChange[] = [];
  for (const iso3 of new Set([...was.keys(), ...now.keys()])) {
    const a = was.get(iso3) ?? 0;
    const b = now.get(iso3) ?? 0;
    if (a !== b) changed.push({ iso3, before: a, after: b });
  }
  changed.sort((a, b) => a.iso3.localeCompare(b.iso3, 'en'));

  // Geometry, where the two sides still line up ring for ring. Where they do
  // not, the count diff above is the honest answer and pairing rings by index
  // would invent movements that are really an insertion.
  const coordinates: CoordinateChange[] = [];
  let coordinateCount = 0;
  if (before.length === after.length) {
    for (const [i, ring] of before.entries()) {
      const other = after[i];
      if (other === undefined || other.iso3 !== ring.iso3 || other.points.length !== ring.points.length) continue;
      for (const [j, point] of ring.points.entries()) {
        const next = other.points[j];
        if (next === undefined) continue;
        if (Object.is(point[0], next[0]) && Object.is(point[1], next[1])) continue;
        coordinateCount += 1;
        if (coordinates.length < COORDINATE_SAMPLE) {
          coordinates.push({ iso3: ring.iso3, ring: i, point: j, before: point, after: next });
        }
      }
    }
  }

  return { before: before.length, after: after.length, changed, coordinates, coordinateCount };
}

/** Enough to diagnose a rounding tie; not so many that a re-generalization floods the report. */
const COORDINATE_SAMPLE = 12;

/**
 * A per-country population moving by more than a quarter is fatal.
 *
 * Not a budget and not tunable: no real country's population moves 25 % in a
 * year, so this only ever fires on a join that went wrong — a code reused for a
 * different territory, a unit change, a row read from the wrong year. The
 * absolute world-total band in `data:check` catches the same class in bulk;
 * this catches the single row that slipped.
 */
export const POPULATION_ALARM = 0.25;

export const populationAlarms = (changes: readonly PopulationChange[]): PopulationChange[] =>
  changes.filter((change) => Math.abs(change.ratio) > POPULATION_ALARM);

// ------------------------------------------------------------- rendering

const truncate = (value: unknown, width = 72): string => {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
  return text.length > width ? `${text.slice(0, width - 1)}…` : text;
};

const percent = (ratio: number): string =>
  Number.isFinite(ratio) ? `${ratio >= 0 ? '+' : ''}${(ratio * 100).toFixed(2)} %` : 'new';

export interface ReportInput {
  diff: DatasetDiff;
  shadowed: readonly ShadowedChange[];
  /** How many countries to name per field before summarizing. */
  sample?: number;
  /** Print every country instead of a sample. */
  full?: boolean;
}

/** The country half of the report: added, removed, then one section per field. */
export function renderCountryDiff(input: ReportInput): string[] {
  const { diff } = input;
  const sample = input.full === true ? Number.POSITIVE_INFINITY : input.sample ?? 8;
  const lines: string[] = [];

  lines.push(
    `countries: ${diff.added.length} added, ${diff.removed.length} removed, ` +
      `${diff.changed.length} changed`,
  );
  for (const country of diff.added) lines.push(`  + ${country.code} ${named(country)}`);
  for (const country of diff.removed) lines.push(`  - ${country.code} ${named(country)}`);

  const byField = new Map<string, { code: string; name: string; change: FieldChange }[]>();
  for (const country of diff.changed) {
    for (const change of country.fields) {
      const list = byField.get(change.field) ?? [];
      list.push({ code: country.code, name: country.name, change });
      byField.set(change.field, list);
    }
  }
  for (const field of FIELDS) {
    const list = byField.get(field);
    if (list === undefined) continue;
    lines.push(`  ${field}: ${list.length} changed`);
    for (const entry of list.slice(0, sample)) {
      lines.push(
        `    ${entry.code} ${entry.name}: ${truncate(entry.change.before)} → ${truncate(entry.change.after)}`,
      );
    }
    if (list.length > sample) lines.push(`    … and ${list.length - sample} more (--full lists them)`);
  }
  return lines;
}

export function renderPopulation(diff: DatasetDiff): string[] {
  const changes = diff.population;
  if (changes.length === 0) return ['population: unchanged for every country'];
  const finite = changes.filter((change) => Number.isFinite(change.ratio));
  const median =
    finite.length === 0
      ? 0
      : [...finite].sort((a, b) => a.ratio - b.ratio)[Math.floor(finite.length / 2)]?.ratio ?? 0;
  const lines = [
    `population: ${changes.length} changed, median ${percent(median)}, ` +
      `largest ${percent(changes[0]?.ratio ?? 0)} (${changes[0]?.code ?? '—'})`,
  ];
  for (const change of changes.slice(0, 8)) {
    lines.push(
      `  ${change.code} ${change.name}: ${change.before.toLocaleString('en-US')} → ` +
        `${change.after.toLocaleString('en-US')} (${percent(change.ratio)})`,
    );
  }
  if (changes.length > 8) lines.push(`  … and ${changes.length - 8} more`);

  const alarms = populationAlarms(changes);
  if (alarms.length > 0) {
    lines.push(`  FATAL: ${alarms.length} over ${POPULATION_ALARM * 100} %:`);
    for (const alarm of alarms) lines.push(`    ${alarm.code} ${alarm.name} ${percent(alarm.ratio)}`);
  }
  return lines;
}

export function renderPolygons(diff: DatasetDiff): string[] {
  const { before, after, changed, coordinates, coordinateCount } = diff.polygons;
  const lines = [`polygons: ${before} → ${after} (${after - before >= 0 ? '+' : ''}${after - before})`];
  for (const change of changed) lines.push(`  ${change.iso3}: ${change.before} → ${change.after}`);

  if (coordinateCount === 0) {
    lines.push('  geometry: identical, coordinate for coordinate');
    return lines;
  }
  const at = (point: readonly [number, number]) => `${point[0]}, ${point[1]}`;
  lines.push(`  geometry: ${coordinateCount} coordinates moved`);
  for (const move of coordinates) {
    lines.push(`    ${move.iso3} ring ${move.ring} point ${move.point}: ${at(move.before)} → ${at(move.after)}`);
  }
  if (coordinateCount > coordinates.length) {
    lines.push(`    … and ${coordinateCount - coordinates.length} more`);
  }
  return lines;
}

/**
 * Every upstream value an override suppressed, grouped by the file that
 * suppressed it — because the maintainer's next action is to open that file.
 */
export function renderShadowed(shadowed: readonly ShadowedChange[], full = false): string[] {
  if (shadowed.length === 0) return ['shadowed: nothing — every override still agrees with upstream'];
  const bySource = new Map<string, ShadowedChange[]>();
  for (const change of shadowed) {
    const list = bySource.get(change.source) ?? [];
    list.push(change);
    bySource.set(change.source, list);
  }
  const lines = [`shadowed: ${shadowed.length} upstream values an override is suppressing`];
  for (const source of [...bySource.keys()].sort()) {
    const list = bySource.get(source)!;
    lines.push(`  ${source}: ${list.length}`);
    // No sampling by default for a small list: this is the section the whole
    // report exists for, and a truncated one is the same silence it prevents.
    const shown = full || list.length <= 25 ? list : list.slice(0, 25);
    for (const change of shown) {
      lines.push(`    ${change.code} ${change.field}: ${truncate(change.fetched)} ⇠ ${truncate(change.override)}`);
    }
    if (shown.length < list.length) {
      lines.push(`    … and ${list.length - shown.length} more (--full lists them)`);
    }
  }
  return lines;
}
