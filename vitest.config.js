import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    // NODE_ENV=test makes src/config/env.js resolve DB_NAME to DB_NAME_TEST, so the suite can
    // only ever touch kitworld_test. Set explicitly rather than relying on vitest's default, so
    // the guarantee is visible here and not an implementation detail of the runner.
    env: { NODE_ENV: 'test' },
    // Suites share one MySQL pool and write to the same tables; running files in parallel would
    // let them interfere. Cheap to serialise while the suite is small.
    fileParallelism: false,
  },
});
