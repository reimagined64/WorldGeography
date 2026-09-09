/**
 * Bundle entry: the whole page in one module graph, in v7's evaluation order.
 *
 * Only `app.js` is still an untouched v7 script — copied out of the frozen
 * fixtures so there is something to run until U16 converts it — and it reads
 * the engine, the globe and the synthesizer off `window`, which is why the
 * order below is load-bearing rather than cosmetic: `core`, `clock`, `audio`
 * and `globe` (all four published by `legacy-globals.ts`), then `app`, exactly
 * as v7's five `<script>` tags ran.
 *
 * The two module imports under the shim are what that order refers to;
 * `legacy-globals.ts` pulls them in first so it can publish them, so they are
 * listed here for the order rather than for the effect.
 *
 * Removal order: U16 replaces the app import and deletes `legacy-globals.ts`.
 */
import './legacy-globals.ts';
import './audio/audio.ts';
import './globe/globe.ts';
import './app/app.js';
