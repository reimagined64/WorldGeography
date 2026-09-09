/**
 * Bundle entry: the whole page in one module graph, in v7's evaluation order.
 *
 * Only the first import is permanent. `audio.js`, `globe.js` and `app.js` are
 * still the untouched v7 scripts — copied out of the frozen fixtures so there
 * is something to run before U5 and U16 convert them — and they register
 * themselves on `window` on evaluation, which is why the order below is
 * load-bearing rather than cosmetic: `core`, `clock` (both via
 * `legacy-globals.ts`), then `audio`, `globe`, `app`, exactly as v7's five
 * `<script>` tags ran.
 *
 * Removal order: U5 replaces the audio and globe imports with module imports,
 * U16 replaces the app import, and whichever lands last also deletes
 * `legacy-globals.ts`.
 */
import './legacy-globals.ts';
import './audio/audio.js';
import './globe/globe.js';
import './app/app.js';
