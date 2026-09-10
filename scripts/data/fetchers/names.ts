/**
 * Display names, from the CLDR data inside Node's ICU.
 *
 * `prepare_data.py` reached CLDR through Babel; `Intl.DisplayNames` reaches the
 * same repertoire through the ICU the runtime already carries, so the Czech
 * labels arrive without a Python dependency and English comes free with them.
 *
 * The version of ICU therefore decides the wording of every country, currency
 * and language label in the game — `Intl.DisplayNames(['cs'], …).of('MAD')` is
 * "marocký dinár" on this build, which the project overrides to "marocký
 * dirham" — so the CLDR version is pinned in `sources.lock.json` beside the two
 * downloads, and the running Node is pinned in `.nvmrc`. Treating it as a
 * source rather than as a language feature is the only way a label moving under
 * an override shows up in the shadowed-changes report.
 */
import type { Locale } from '../../../src/engine/types.ts';

export interface DisplayNamer {
  readonly locale: Locale;
  /** ISO 3166-1 alpha-2 → country name. */
  region(code: string): string;
  /** ISO 4217 → currency name. */
  currency(code: string): string;
  /** Language tag → language name. */
  language(tag: string): string;
}

export function displayNames(locale: Locale): DisplayNamer {
  const region = new Intl.DisplayNames([locale], { type: 'region' });
  const currency = new Intl.DisplayNames([locale], { type: 'currency' });
  const language = new Intl.DisplayNames([locale], { type: 'language' });
  // `of` returns the input unchanged for a code CLDR does not know, which is
  // the right fallback: a label the player can still read, and a value the
  // override layer can pin.
  return {
    locale,
    region: (code) => region.of(code) ?? code,
    currency: (code) => currency.of(code) ?? code,
    language: (tag) => language.of(tag) ?? tag,
  };
}

/**
 * Narrows a language code to the tag the game compares.
 *
 * `world-countries` keys its languages by ISO 639-3 — `ces`, `pus`, `prs` —
 * while the deck, the distractor filter and every entry in
 * `data/overrides/languages.json` use the two-letter form where one exists.
 * ICU knows the mapping, including the ones that are not a simple truncation:
 * `prs` (Dari) canonicalizes to `fa-AF`, whose language subtag is `fa`, which
 * is precisely the tag the Afghanistan override already pins.
 */
export function canonicalLanguage(tag: string): string {
  try {
    return new Intl.Locale(tag).language;
  } catch {
    return tag;
  }
}
