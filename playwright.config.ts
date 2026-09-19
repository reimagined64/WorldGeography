/**
 * Chromium settings shared by every browser job in this project.
 *
 * `audio-golden.json` is a digest of one browser's synthesis, so the browser
 * has to be pinned: `@playwright/test` is an exact version in `package.json`
 * and `.nvmrc` pins Node, which together fix the Chromium build the fixture
 * was captured from. `scripts/capture-golden.ts` imports `CHROMIUM_LAUNCH`
 * from here rather than opening its own browser its own way.
 *
 * `globalSetup` builds `dist/` once, before the first worker starts. Four specs
 * open the published directory and the obfuscation pass is seconds each time;
 * more importantly, one build means one artifact, so a spec that passed and a
 * spec that failed are talking about the same bytes. It also makes
 * `npm run test:browser` self-sufficient — it never inherits a stale `dist/`
 * from an earlier `npm run build`.
 */
import { defineConfig, devices } from '@playwright/test';

/** Headless, no sandbox arguments: the capture only opens a local file:// origin over http. */
export const CHROMIUM_LAUNCH = { headless: true } as const;

export default defineConfig({
  testDir: 'tests/browser',
  globalSetup: 'tests/setup/publish-dist.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  workers: 1,
  // `list` reads well in a terminal and in a workflow log alike; under CI it is
  // joined by the HTML report, which is what `ci.yml` uploads when something
  // fails. Locally the extra report would be a directory nobody opens.
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  // Playwright's 30s default is a network-test budget, and none of these are
  // network tests. The audio render walks 21 themes through OfflineAudioContext
  // and the styles gate renders 16 scenes at 8 widths twice over; both take
  // seconds here and roughly three times that on a shared CI runner, where the
  // default fails them for being slow rather than wrong. The job's own limit is
  // what catches a genuine hang.
  timeout: 180_000,
  use: {
    ...devices['Desktop Chrome'],
    launchOptions: { ...CHROMIUM_LAUNCH },
    /*
     * Pinned since U11, because the game now reads `navigator.languages`.
     * Without this the suite speaks whatever language the runner's Chromium
     * was built for — Czech here, English on a CI image — and every assertion
     * about a label would be a coin toss. `tests/browser/i18n.spec.ts` is where
     * the other language is exercised, deliberately.
     */
    locale: 'cs-CZ',
    /*
     * A failing spec keeps its trace; a passing one leaves nothing behind. The
     * one failure this suite is expected to have on a fresh runner — the style
     * fixture, which measures text laid out in fonts a CI image does not have —
     * is only diagnosable from the rendered boxes, and a log line cannot carry
     * those.
     */
    trace: 'retain-on-failure',
  },
});
