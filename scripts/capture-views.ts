/**
 * Capture `tests/fixtures/views-cs-golden.json`: the Czech every screen prints.
 *
 * Run once, before U11 moves a single literal into the catalog, and then only
 * when a Czech string is *meant* to change — the fixture is the oracle for "the
 * player sees what they saw", so regenerating it to make a test pass would
 * delete the only evidence that the sweep was faithful.
 *
 *   node scripts/capture-views.ts
 */
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installApp } from '../tests/helpers/app-harness.ts';
import { captureViews } from '../tests/helpers/views-golden.ts';

export const VIEWS_FIXTURE = fileURLToPath(new URL('../tests/fixtures/views-cs-golden.json', import.meta.url));

const invoked = process.argv[1];
if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  const app = installApp();
  try {
    const scenes = await captureViews(app);
    const body = Object.entries(scenes)
      .map(([name, html]) => `${JSON.stringify(name)}: ${JSON.stringify(html)}`)
      .join(',\n');
    writeFileSync(VIEWS_FIXTURE, `{\n${body}\n}\n`, 'utf8');
    console.log(`Captured ${Object.keys(scenes).length} rendered fragments to ${VIEWS_FIXTURE}`);
  } finally {
    app.restore();
  }
}
