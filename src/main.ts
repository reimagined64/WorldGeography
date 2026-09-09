/**
 * Bundle entry: the whole page in one module graph, in v7's evaluation order.
 *
 * `app.js` is the last v7 script still in its original language — it is being
 * emptied module by module rather than converted in one move — and it reaches
 * everything it no longer owns off `window`, which is why the order below is
 * load-bearing rather than cosmetic: the engine, the clock, the synthesizer,
 * the globe and the `src/app/` modules U6 lifted out (all published by
 * `legacy-globals.ts`), then `app`, exactly as v7's five `<script>` tags ran.
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
