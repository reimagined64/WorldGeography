/**
 * Build the published directory once, before any browser spec runs.
 *
 * Four specs open `dist/` — the golden walk, the offline claim, storage, and
 * the site's own shape — and the obfuscation pass is a few seconds each time.
 * More to the point, four builds are four artifacts: a spec that passed against
 * its own copy says nothing about the copy the next spec failed on. One build,
 * one `dist/`, one sha256, and the deploy publishes the same bytes CI tested
 * (R27, KTD18).
 *
 * It is a Playwright `globalSetup` rather than a fixture because it has to
 * happen before the first worker starts and exactly once. `npm run test:browser`
 * is therefore self-sufficient: it does not assume `npm run build` ran first,
 * and it cannot pass against a stale directory left by one that did.
 *
 * `dist/` is gitignored, so this writes nothing the repository tracks — the
 * "no test writes into the repository" gate is about the committed tree, and
 * the build output is the one thing that is expected to appear there.
 */
import { writeDist } from '../../scripts/obfuscate.ts';

export default async function publishDist(): Promise<void> {
  const started = Date.now();
  const report = await writeDist();
  console.log(
    `Published ${report.dir} — ${report.files.length} files, `
      + `index.html ${report.bytes.toLocaleString('en-US')} bytes, `
      + `${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
}
