/**
 * The static page chrome, translated in place.
 *
 * Everything else the game prints is produced by a render function, so a
 * language switch reaches it by rendering again. The header, the globe
 * controls, the map legend, the footer and the dialog frame are not: they are
 * written once in `index.template.html` and never re-rendered, which is exactly
 * why they were the parts of v7 that no amount of catalog work would have
 * translated on its own.
 *
 * They carry their key in a `data-i18n` attribute rather than being rebuilt
 * from a template here, because the markup is the page's structure — ids the
 * shell binds to, an inert `<canvas>`, a `<dialog>` — and rebuilding it from
 * JavaScript would mean the page has no content until the bundle runs. The
 * Czech in the template stays as the pre-JavaScript reading.
 */
import { t, type CatalogKey } from './index.ts';

/** Attribute to write, and the attribute naming the key. */
const TARGETS: readonly (readonly [string, string])[] = [
  ['data-i18n', 'textContent'],
  ['data-i18n-label', 'aria-label'],
  ['data-i18n-title', 'title'],
];

/**
 * Rewrite every element the template marked, in the active language.
 *
 * Called on boot and again on every switch. Elements are found fresh each time
 * rather than cached, because the dialog frame is inside a `<dialog>` that the
 * shell opens and closes and the cache would outlive nothing useful.
 */
export function translateChrome(root: Document = document): void {
  for (const [marker, target] of TARGETS) {
    for (const element of root.querySelectorAll<HTMLElement>(`[${marker}]`)) {
      const key = element.getAttribute(marker) as CatalogKey | null;
      if (key === null) continue;
      if (target === 'textContent') element.textContent = t(key);
      else if (target === 'title') element.title = t(key);
      else element.setAttribute(target, t(key));
    }
  }
}
