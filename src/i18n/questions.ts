/**
 * The question bundles, and the one that is live.
 *
 * Separate from `index.ts` because the engine consumes these and the shell
 * consumes that: `t` looks a key up in the active catalog at call time, while a
 * bundle is handed to `makeQuestion` whole and its strings are baked into a
 * run. A question written in Czech stays Czech for as long as that run lives,
 * which is the point of KTD13 — so the two lookups must not be the same lookup.
 *
 * The engine never imports this file. It declares `QuestionBundle` in
 * `engine/types.ts` and is given one; the direction of the dependency is what
 * keeps the engine free of a language it would otherwise have a default of.
 */
import type { QuestionBundle } from '../engine/types.ts';
import { locale, type Locale } from './index.ts';
import { csQuestions } from './questions.cs.ts';
import { enQuestions } from './questions.en.ts';

export const QUESTION_BUNDLES: Readonly<Record<Locale, QuestionBundle>> = Object.freeze({
  cs: csQuestions,
  en: enQuestions,
});

/** The bundle a question generated right now would be written in. */
export const questionBundle = (): QuestionBundle => QUESTION_BUNDLES[locale()];

/**
 * How a `LocalizedText` reads on screen right now.
 *
 * The shell's counterpart to the engine's `pick`: a view renders in whatever
 * language is active this second — the atlas retitles itself the moment the
 * switcher is used — whereas a question is fixed to the bundle it was built
 * from. Two readers, because they answer two different questions.
 */
export const pick = (text: Readonly<Record<Locale, string>>): string => text[locale()];
