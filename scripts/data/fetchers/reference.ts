/**
 * Country reference facts, from the `world-countries` package.
 *
 * This is the one data devDependency, and it replaces `countryinfo` plus
 * `pycountry`: ISO 3166 codes, English capital names, currencies, languages,
 * continent and a representative position. Its `borders` adjacency graph and
 * `area` are not read, because nothing in the game asks for them.
 *
 * Its data is ODC-ODbL 1.0, not MIT. `data/build/countries.json` is therefore a
 * derived database carrying a share-alike and attribution obligation, which is
 * why `licenses/ODbL-1.0.txt` ships and why the notices name it. That was
 * RISK-1, and it was resolved by accepting the obligation rather than by
 * dropping the package.
 *
 * The country set is the game's, not the package's: the 193 UN member states
 * plus Palestine and the Holy See. `unMember` gets 194 of them — the package
 * marks Vatican City as a member, which it is not; it is a non-member observer
 * state, and it belongs in the game either way — so Palestine is the single
 * named addition. The result is exactly 195, and `data:check` asserts it.
 */
import { createRequire } from 'node:module';
import { canonicalLanguage } from './names.ts';

/** One upstream record, reduced to the fields the merge reads. */
export interface ReferenceCountry {
  code: string;
  iso3: string;
  /** English capital names, as the locale bundles' translation tables key them. */
  capital: readonly string[];
  currency: readonly string[];
  /** Two-letter tags where ISO 639 has one; see `canonicalLanguage`. */
  languages: readonly string[];
  lat: number;
  lon: number;
  /** Upstream's own continent, which is one `Americas`. `regions.json` splits it. */
  region: string;
}

interface RawCountry {
  cca2?: unknown;
  cca3?: unknown;
  unMember?: unknown;
  capital?: unknown;
  currencies?: unknown;
  languages?: unknown;
  latlng?: unknown;
  region?: unknown;
}

/** Non-members the game carries anyway, with the reason spelled out. */
export const ADDITIONAL_COUNTRIES: Readonly<Record<string, string>> = {
  PS: 'Palestine — UN non-member observer state, in the game since v7.',
};

const require = createRequire(import.meta.url);

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/** Reads and reduces the package. Throws if a selected country is missing a field. */
export function readReference(): ReferenceCountry[] {
  const all = require('world-countries/countries.json') as RawCountry[];
  const out: ReferenceCountry[] = [];

  for (const raw of all) {
    const code = raw.cca2;
    const iso3 = raw.cca3;
    if (typeof code !== 'string' || typeof iso3 !== 'string') continue;
    if (raw.unMember !== true && ADDITIONAL_COUNTRIES[code] === undefined) continue;

    const latlng = Array.isArray(raw.latlng) ? raw.latlng : [];
    const [lat, lon] = latlng as [unknown, unknown];
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      throw new Error(`world-countries: ${code} has no usable \`latlng\``);
    }
    if (typeof raw.region !== 'string' || raw.region === '') {
      throw new Error(`world-countries: ${code} has no \`region\``);
    }

    const currencies = typeof raw.currencies === 'object' && raw.currencies !== null ? raw.currencies : {};
    const languages = typeof raw.languages === 'object' && raw.languages !== null ? raw.languages : {};

    out.push({
      code,
      iso3,
      capital: strings(raw.capital),
      currency: Object.keys(currencies),
      // De-duplicated after canonicalization: Afghanistan lists `prs` and `fas`
      // separately upstream and both narrow to `fa`.
      languages: [...new Set(Object.keys(languages).map(canonicalLanguage))],
      lat,
      lon,
      region: raw.region,
    });
  }

  out.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return out;
}
