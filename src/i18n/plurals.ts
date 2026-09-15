/**
 * Plural selection, which in Czech is not a boolean.
 *
 * `Intl.PluralRules` is in every browser this game targets and already knows
 * that Czech has four categories, so the whole module is a cached lookup and a
 * fallback. What it replaces is worth naming: v7 wrote `${n} pokusů` at ten
 * sites, which is the genitive plural and is wrong for one through four — the
 * shipped game tells a player on their last attempt that they have "1 pokusů".
 * `attemptWord` in `app/dom.ts` is the one place that got it right, and it is
 * the shape every count-dependent entry in the catalog now has.
 *
 * The rules are cached because `Intl.PluralRules` construction is the expensive
 * part and `tickClock` renders sixty times a second.
 */
import type { Locale } from './locales.ts';

/** The CLDR categories. Czech uses all four; English uses `one` and `other`. */
export type PluralCategory = 'one' | 'few' | 'many' | 'other';

/**
 * One count-dependent catalog entry. `other` is required because it is the
 * fallback for every category a locale's catalog does not spell out — English
 * never selects `few`, and Czech `many` only comes up for decimals.
 */
export type PluralForms = Partial<Record<PluralCategory, string>> & { other: string };

const RULES = new Map<Locale, Intl.PluralRules>();

function rules(locale: Locale): Intl.PluralRules {
  const cached = RULES.get(locale);
  if (cached !== undefined) return cached;
  const made = new Intl.PluralRules(locale);
  RULES.set(locale, made);
  return made;
}

export const pluralCategory = (locale: Locale, n: number): PluralCategory =>
  rules(locale).select(n) as PluralCategory;

/** The form `n` takes in `locale`, falling back to `other`. */
export const plural = (locale: Locale, n: number, forms: PluralForms): string =>
  forms[pluralCategory(locale, n)] ?? forms.other;
