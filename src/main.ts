/**
 * Bundle entry: the whole page in one module graph.
 *
 * There is nothing left to order by hand. v7 shipped five `<script>` tags and
 * the transitional builds had to reproduce that order, because `app.js` reached
 * everything it did not own off `window`; now every module says what it needs
 * and esbuild resolves the graph. `boot()` is called rather than run as a module
 * body so that `src/app/main.ts` can be imported without a browser.
 */
import { boot } from './app/main.ts';

boot();
