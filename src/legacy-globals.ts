/**
 * Transitional bridge: the TypeScript engine and the ported app modules,
 * published under the names the not-yet-ported v7 script looks for.
 *
 * v7 had no module system, so `app.js` reaches the engine through
 * `window.GeoCore`, the globe through `window.GeoGlobe`, the synthesizer
 * through `window.GeoAudio` and the clock through the bare global `GeoClock`.
 * Nothing under `src/engine/`, `src/globe/` or `src/audio/` knows that `window`
 * exists and nothing should, so the coupling is isolated here — one file, and
 * the only file in the tree that writes a global.
 *
 * `window.GeoApp` is the same trick pointed the other way: `app.js` is still
 * plain JavaScript, so the modules U6 lifted out of it — the store, the storage
 * codec, the dialogs, the mobile HUD and the atlas — are handed to it here
 * rather than imported by it. The data flows back as arguments: each module
 * takes the country database and the render helpers it needs from a host
 * object the monolith builds, so nothing in `src/app/` reaches for a global of
 * its own.
 *
 * It has to be its own module rather than a few lines at the top of
 * `main.ts`: `import` declarations are hoisted above statements, so an
 * assignment written next to them would run *after* the legacy scripts, not
 * before. Importing this module first is what fixes the order.
 *
 * U16 deletes this file once `app.ts` imports all of it directly.
 */
import * as core from './engine/core.ts';
import { GeoClock } from './engine/clock.ts';
import { GeoAudio } from './audio/audio.ts';
import { Globe } from './globe/globe.ts';
import * as storage from './app/storage.ts';
import { installDebugApi, requireAudio, requireGlobe, store } from './app/state.ts';
import { showHelp } from './app/dialogs/help.ts';
import { showSources } from './app/dialogs/sources.ts';
import { showAudioSettings } from './app/dialogs/audio-settings.ts';
import { renderMobileHud } from './app/mobile-hud.ts';
import { createAtlas } from './app/views/atlas.ts';

const legacy = window as unknown as Record<string, unknown>;

// Spread rather than assign the namespace object: v7's `core.js` handed back a
// plain object literal, and a module namespace is frozen and getter-backed.
legacy['GeoCore'] = { ...core };
legacy['GeoClock'] = GeoClock;
// The classes go across as themselves: `app.js` calls `new GeoGlobe(...)` and
// `new GeoAudio(...)` and reads `GeoAudio.QUESTION_SCORES` off the constructor.
legacy['GeoAudio'] = GeoAudio;
legacy['GeoGlobe'] = Globe;

legacy['GeoApp'] = {
  store,
  requireGlobe,
  requireAudio,
  installDebugApi,
  storage: { ...storage },
  showHelp,
  showSources,
  showAudioSettings,
  renderMobileHud,
  createAtlas,
};
