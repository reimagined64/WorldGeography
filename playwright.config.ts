/**
 * Chromium settings shared by every browser job in this project.
 *
 * `audio-golden.json` is a digest of one browser's synthesis, so the browser
 * has to be pinned: `@playwright/test` is an exact version in `package.json`
 * and `.nvmrc` pins Node, which together fix the Chromium build the fixture
 * was captured from. `scripts/capture-golden.ts` imports `CHROMIUM_LAUNCH`
 * from here rather than opening its own browser its own way.
 *
 * U14 fills `tests/browser/` and owns the reporter and CI wiring.
 */
import { defineConfig, devices } from '@playwright/test';

/** Headless, no sandbox arguments: the capture only opens a local file:// origin over http. */
export const CHROMIUM_LAUNCH = { headless: true } as const;

export default defineConfig({
  testDir: 'tests/browser',
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    launchOptions: { ...CHROMIUM_LAUNCH },
  },
});
