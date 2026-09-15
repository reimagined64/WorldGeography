/**
 * The catalog runtime: one active locale, one lookup, and the detection that
 * chooses between them.
 *
 * No library. Two hard-coded locales inside an offline bundle do not pay for
 * one, and the parts a library would bring — plural categories and number
 * formatting — are already in the platform as `Intl`.
 *
 * The catalog is flat and dotted rather than nested. Nesting reads better in a
 * file nobody opens; a flat object gives `keyof typeof cs` as the key type, so
 * a mistyped key is a compile error and `en.ts` is forced by the compiler to
 * answer every key `cs.ts` does.
 *
 * `t` does **not** escape. Every call site that interpolates player data
 * already wraps it in `esc`, and many catalog entries are markup fragments; an
 * escaping `t` would either double-escape those or force the markup out of the
 * catalog and back into the views, which is where it came from.
 */
import type { QuestionKind, RegionFilter } from '../engine/types.ts';
import { cs } from './cs.ts';
import { en } from './en.ts';
import { plural, type PluralForms } from './plurals.ts';
import { FALLBACK_LOCALE, isLocale, LEGACY_LOCALE, LOCALES, type Locale } from './locales.ts';

export type { Locale } from './locales.ts';
export { LOCALES, LOCALE_NAMES, isLocale, FALLBACK_LOCALE, LEGACY_LOCALE } from './locales.ts';

/** A catalog entry: plain text, or one form per plural category. */
export type CatalogValue = string | PluralForms;

/** `cs.ts` is the shape; `en.ts` is checked against it. */
export type Catalog = Record<keyof typeof cs, CatalogValue>;
export type CatalogKey = keyof typeof cs;

const CATALOGS: Readonly<Record<Locale, Catalog>> = Object.freeze({ cs, en });

/**
 * Czech until something says otherwise.
 *
 * Not the detection fallback: this is what the catalog answers before `boot`
 * has run detection, and before this unit that was the only thing the game
 * could say. A module that has never been told a locale should behave exactly
 * as the build that had no locales at all.
 */
let active: Locale = LEGACY_LOCALE;

export const locale = (): Locale => active;

export function setLocale(next: Locale): void {
  if (!LOCALES.includes(next)) throw new RangeError(`unknown locale: ${String(next)}`);
  active = next;
}

/**
 * Which language to open in.
 *
 * A stored choice wins outright — the player said so — and is checked rather
 * than trusted, because it comes back out of `localStorage`. Otherwise the
 * browser's list is walked **in order**, taking the first primary subtag this
 * game has: `['sk','cs','en']` is a reader who prefers Slovak, has Czech
 * second, and should get Czech rather than English.
 */
export function detectLocale(languages: readonly string[], saved?: unknown): Locale {
  if (isLocale(saved)) return saved;
  for (const tag of languages) {
    const primary = String(tag).toLowerCase().split('-')[0];
    if (isLocale(primary)) return primary;
  }
  return FALLBACK_LOCALE;
}

/** `{name}` → `params.name`. A parameter a template does not name is ignored. */
const interpolate = (template: string, params: Record<string, unknown>): string =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole);

/**
 * One string out of the active catalog.
 *
 * A count-dependent entry is selected with `params.count`, which is also
 * available to the template as `{count}` — every one of them prints the number
 * next to the word, and asking the caller to pass it twice would be the kind of
 * duplication that goes wrong once.
 */
export function t(key: CatalogKey, params: Record<string, unknown> = {}): string {
  const value = CATALOGS[active][key];
  if (value === undefined) throw new Error(`no catalog entry for "${key}" in ${active}`);
  if (typeof value === 'string') return interpolate(value, params);
  const count = Number(params['count']);
  if (!Number.isFinite(count)) throw new TypeError(`"${key}" is count-dependent and needs a count`);
  return interpolate(plural(active, count, value), params);
}

/**
 * The display name of a region or of the "everywhere" filter.
 *
 * Its own function because the key is built from a value that arrives as data —
 * `country.region` is a string in `countries.json` — and building a catalog key
 * by concatenation is exactly where a typo stops being a compile error.
 */
export const regionName = (region: RegionFilter): string => t(`region.${region}` as CatalogKey);

/** The display name of a question kind, from the same data-shaped key. */
export const kindName = (kind: QuestionKind): string => t(`kind.${kind}` as CatalogKey);

/** Numbers follow the reader's language: `8 000` in Czech, `8,000` in English. */
export const formatNumber = (n: number, options?: Intl.NumberFormatOptions): string =>
  n.toLocaleString(active, options);
