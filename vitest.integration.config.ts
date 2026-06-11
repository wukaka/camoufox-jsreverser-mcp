import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Camoufox does not tolerate multiple concurrent instances (upstream issue #391),
    // and every integration file spins up its own browser. Force one-at-a-time so
    // suites don't fight each other for ports / state.
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
