/**
 * The game's own test surface, declared once for every browser spec.
 *
 * Three specs now reach for `window.WorldGeography`, and each had been
 * narrowing it by hand to the few members it happened to read. Two such
 * declarations in one project is a merge conflict the compiler reports as
 * "subsequent property declarations must have the same type"; more to the
 * point, a hand-written narrowing is a second copy of a type that already
 * exists and is free to drift from it.
 *
 * So the shape is taken from `createDebugApi`'s own return type. A member
 * renamed in `src/app/state.ts` now fails the typecheck in every spec that
 * reads it, which is what the narrowing was reaching for in the first place.
 *
 * Importing this file for its side effect is what installs the declaration:
 * `import '../helpers/page-api.ts';`.
 */
import type { DebugApi } from '../../src/app/state.ts';

declare global {
  interface Window {
    /** Absent until `boot()` has published it, which is why it is optional. */
    WorldGeography?: Readonly<DebugApi>;
  }
}
