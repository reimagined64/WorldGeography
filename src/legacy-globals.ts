/**
 * Transitional bridge: the TypeScript engine, published under the names the
 * not-yet-ported v7 scripts look for.
 *
 * v7 had no module system, so `app.js` reaches the engine through
 * `window.GeoCore` and the bare global `GeoClock`. Nothing under `src/engine/`
 * knows that `window` exists and nothing should, so the coupling is isolated
 * here — one file, and the only file in the tree that writes a global.
 *
 * It has to be its own module rather than a few lines at the top of
 * `main.ts`: `import` declarations are hoisted above statements, so an
 * assignment written next to them would run *after* the legacy scripts, not
 * before. Importing this module first is what fixes the order.
 *
 * U16 deletes this file once `app.ts` imports the engine directly.
 */
import * as core from './engine/core.ts';
import { GeoClock } from './engine/clock.ts';

const legacy = window as unknown as Record<string, unknown>;

// Spread rather than assign the namespace object: v7's `core.js` handed back a
// plain object literal, and a module namespace is frozen and getter-backed.
legacy['GeoCore'] = { ...core };
legacy['GeoClock'] = GeoClock;
