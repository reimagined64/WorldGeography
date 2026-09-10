/**
 * Population, from the UN World Population Prospects CSV.
 *
 * v7 carried Worldometer's rendering of the same UN series, transcribed by
 * hand; R13 reads the series itself. The file is 84,000 rows of every indicator
 * for every location and aggregate from 1950 to 2100, so almost all of the work
 * here is throwing rows away: `LocTypeName === 'Country/Area'` drops the
 * regional and income-group aggregates, and the target year drops the rest.
 *
 * Two details decide whether the numbers are right at all:
 *
 *   - `TPopulation1July` is published **in thousands**. A refresh that forgot
 *     the multiplication would put the world at 8.3 million people, which is
 *     exactly why `data:check` bounds the world total rather than trusting it.
 *   - the aggregate rows carry a blank `ISO3_code`, and at least one of them
 *     ("African, Caribbean and Pacific (ACP) Group of States") has a comma
 *     inside a quoted field. A `split(',')` reads that row four columns short
 *     and silently attributes a region's population to whatever lands in the
 *     ISO3 column, so the parser has to be a real one.
 */
import { gunzipSync } from 'node:zlib';
import { fetchPinned, type FetchOptions } from '../sources.ts';

/** One reduced row: everything the merge needs and nothing else. */
export interface PopulationRow {
  iso3: string;
  /** Upstream's own location name, kept for the report only. */
  location: string;
  /** People, already multiplied out of thousands and rounded. */
  population: number;
  year: number;
}

/**
 * RFC 4180 with the two extensions real files use: a `""` escape inside a
 * quoted field, and CRLF or LF line endings mixed freely.
 *
 * Hand-written rather than a dependency because the project ships with zero
 * runtime dependencies and this is forty lines; the three cases that make a
 * naive split wrong — a quoted comma, a quoted newline, a doubled quote — are
 * each pinned by a test.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  // A UTF-8 BOM would otherwise become part of the first column name, and the
  // WPP file has one.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const endField = (): void => {
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    // A trailing newline must not produce a row of one empty field.
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') endField();
    else if (ch === '\n') endRow();
    else if (ch === '\r') {
      if (source[i + 1] === '\n') i += 1;
      endRow();
    } else field += ch;
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

/** Column indices, resolved by name so a reordered release fails loudly. */
function columns(header: readonly string[], names: readonly string[]): number[] {
  return names.map((name) => {
    const at = header.indexOf(name);
    if (at < 0) {
      throw new Error(
        `the WPP CSV has no \`${name}\` column — upstream changed shape. Columns: ${header.join(', ')}`,
      );
    }
    return at;
  });
}

/** Reduces the whole CSV to one row per country for one year. */
export function reducePopulation(csv: string, year: number): PopulationRow[] {
  const rows = parseCsv(csv);
  const header = rows[0];
  if (header === undefined) throw new Error('the WPP CSV is empty');
  const [iIso3, iType, iLoc, iYear, iPop] = columns(header, [
    'ISO3_code',
    'LocTypeName',
    'Location',
    'Time',
    'TPopulation1July',
  ]) as [number, number, number, number, number];

  const out: PopulationRow[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r]!;
    if (row[iType] !== 'Country/Area') continue;
    if (Number(row[iYear]) !== year) continue;
    const iso3 = (row[iIso3] ?? '').trim();
    // Aggregates reach this far only if `LocTypeName` ever changes meaning;
    // a blank code is not a country and must never become one.
    if (iso3 === '') continue;
    const thousands = Number(row[iPop]);
    if (!Number.isFinite(thousands)) {
      throw new Error(`${iso3}: \`TPopulation1July\` for ${year} is not a number ("${row[iPop] ?? ''}")`);
    }
    // Published in thousands. `Math.round` because 33522.052 * 1000 lands at
    // 33522052.000000004 in binary floating point, and a population is a count.
    out.push({ iso3, location: row[iLoc] ?? iso3, population: Math.round(thousands * 1000), year });
  }
  if (out.length === 0) throw new Error(`the WPP CSV has no Country/Area rows for ${year}`);
  return out;
}

export interface PopulationFetch {
  rows: PopulationRow[];
  pin: Awaited<ReturnType<typeof fetchPinned>>;
}

/** Downloads, verifies, gunzips and reduces. */
export async function fetchPopulation(year: number, options: FetchOptions): Promise<PopulationFetch> {
  const pin = await fetchPinned('un-wpp', options);
  const csv = gunzipSync(pin.bytes).toString('utf8');
  return { rows: reducePopulation(csv, year), pin };
}
