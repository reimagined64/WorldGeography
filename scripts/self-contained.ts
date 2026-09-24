/**
 * R8, as one rule, importable by anything.
 *
 * This lived in `scripts/build.ts` until the deploy needed it. That file
 * imports esbuild at module scope, so reaching for `assertSelfContained` there
 * drags the whole bundler in — which is fine for a build and fatal for a job
 * that deliberately does not install the toolchain, because the deploy does not
 * build. It downloads the artifact CI tested and checks it.
 *
 * So the rule moves here, into a module with no imports at all, and
 * `scripts/build.ts` re-exports it. There is still exactly one implementation:
 * the alternative was a second copy in the workflow's shell, and a second copy
 * of a rule this load-bearing is a rule that drifts. `dist/index.html` and
 * `dist/404.html` are both held to it, in the build and again before publishing.
 */

/**
 * References a browser would resolve on its own, as opposed to a URL the page
 * merely prints or opens on a click.
 *
 * The citation links in `sources.json` and the attribution URLs in the licence
 * notices are `https://` text and stay that way, so "contains no http" is the
 * wrong test — R8 is about what loads without the user asking. Anything that
 * fetches is either an element attribute, a CSS reference, or a network API.
 */
const EXTERNAL_REFERENCE_PATTERNS: readonly RegExp[] = [
  // Elements that exist only to pull in something else. `<script>` and `<img>`
  // are absent from this list because the document legitimately contains
  // both — the attribute rule below is what constrains them.
  /<(?:link|base|iframe|embed|object|frame)\b/gi,
  // A resource attribute may only hold a `data:` URI or a template expression
  // that produces one. A relative path is as fatal as an absolute URL: it is
  // the second file a single-file build is not allowed to have. Deliberately
  // strict enough to also catch `element.src = value` in script — a false
  // positive costs a rename and a loud message, a false negative ships R8.
  /\b(?:src|srcset|poster)\s*=\s*(?!["']?(?:data:|\$\{))/gi,
  /@import\b/gi,
  /\burl\(\s*["']?(?!data:|#)(?:[a-z][a-z0-9+.-]*:|\/\/)/gi,
  /\b(?:fetch|importScripts|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon)\s*\(/g,
];

/**
 * Fail the build, not the review, if anything in the output would go to the
 * network. R8 is the product's identity; nothing else in the pipeline notices
 * a stray `<script src>` sneaking in through a source file.
 */
export function assertSelfContained(html: string): void {
  const found: string[] = [];
  for (const pattern of EXTERNAL_REFERENCE_PATTERNS) {
    for (const match of html.matchAll(pattern)) found.push(match[0]);
  }
  if (found.length > 0) {
    throw new Error(
      `Built output is not self-contained; it would load ${found.length} external reference(s):\n  ${[...new Set(found)].join('\n  ')}`,
    );
  }
}

