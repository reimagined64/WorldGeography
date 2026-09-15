/**
 * The two locales, and nothing else.
 *
 * Its own module so that `plurals.ts`, the catalogs and the runtime can each
 * name the type without importing one another: `index.ts` imports both
 * catalogs, and a catalog that imported `index.ts` back would be a cycle
 * evaluated during module initialization, which is the one kind that breaks.
 */
import type { Locale } from '../engine/types.ts';

export type { Locale } from '../engine/types.ts';

/**
 * The runtime list, checked against the data model's own union.
 *
 * `Locale` is declared once, in `engine/types.ts`, because the dataset is typed
 * by it — `LocaleBundle`, `LocalizedCountry` and the rest — and two
 * declarations of the same two strings would drift the first time a third
 * language was considered. The annotation below is what makes this list a
 * consequence of that union rather than a second opinion about it: adding a
 * locale to the type without adding it here fails `Exhaustive`.
 */
export const LOCALES: readonly Locale[] = ['cs', 'en'];

/** Compile error if `LOCALES` stops covering every member of `Locale`. */
type Exhaustive = Exclude<Locale, (typeof LOCALES)[number]> extends never ? true : never;
const EXHAUSTIVE: Exhaustive = true;
void EXHAUSTIVE;

/**
 * Where detection lands when the browser asks for neither language.
 *
 * English rather than Czech: a reader whose browser says `de` has told it they
 * read something other than Czech, and English is the likelier of the two this
 * game speaks.
 */
export const FALLBACK_LOCALE: Locale = 'en';

/**
 * The language a payload with no language in it must be read as.
 *
 * A `wg.run.v7` written before this unit is Czech by construction — it is the
 * only language that existed when it was saved — so a save with no `lang` field
 * resumes as Czech rather than as whatever the browser now prefers.
 */
export const LEGACY_LOCALE: Locale = 'cs';

/** The language a switcher entry announces itself in, written in that language. */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = Object.freeze({
  cs: 'Čeština',
  en: 'English',
});

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
