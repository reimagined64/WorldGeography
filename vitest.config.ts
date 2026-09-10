import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // U3: fixtures are captured deliberately, never as a side effect of a test
    // run. This fails the run if any file under the repository changed.
    globalSetup: ['tests/setup/no-repo-writes.ts'],
    // The fixture suites are compute-bound, not IO-bound: one walks all 14,040
    // question variants, another regenerates them twice, a third replays 48
    // runs over 19,762 steps. They finish in a couple of seconds here and in
    // roughly three times that on a shared CI runner, so vitest's 5s default
    // fails them for being slow rather than wrong. The job's own 20-minute
    // limit is what catches a genuine hang.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
