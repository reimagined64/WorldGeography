import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // U3: fixtures are captured deliberately, never as a side effect of a test
    // run. This fails the run if any file under the repository changed.
    globalSetup: ['tests/setup/no-repo-writes.ts'],
  },
});
