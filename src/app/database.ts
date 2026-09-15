/**
 * The four inert `<script>` blocks the page ships, once they have been parsed.
 *
 * v7 read them into `const countries`, `const flags` and friends at the top of
 * the one IIFE, and every view closed over those bindings. Modules cannot share
 * a closure, so the same values are published here instead — as live bindings
 * rather than as an object, because `byCode[q.country]` is written a hundred
 * times across the views and `db().byCode[q.country]` is not the same code.
 *
 * Nothing here touches the DOM. `boot()` reads the blocks, `validateCountries`
 * gets its chance to reject them, and only then does the database exist — which
 * is also what lets a Node suite install the real `data/build/` files and
 * render a view without a browser.
 */
import type { LocalizedCountry } from '../engine/types.ts';
import type { SourceEntry } from './dialogs/sources.ts';

export interface Database {
  countries: LocalizedCountry[];
  byCode: Readonly<Record<string, LocalizedCountry>>;
  flags: Readonly<Record<string, string>>;
  sources: readonly SourceEntry[];
  /** The text of the inert `#license-data` block, printed by the sources dialog. */
  licenseText: string;
}

export let countries: LocalizedCountry[] = [];
export let byCode: Readonly<Record<string, LocalizedCountry>> = {};
export let flags: Readonly<Record<string, string>> = {};
export let sources: readonly SourceEntry[] = [];
export let licenseText = '';

/** Called once by `boot()`, after the database has passed `validateCountries`. */
export function installDatabase(database: Database): void {
  ({ countries, byCode, flags, sources, licenseText } = database);
}
