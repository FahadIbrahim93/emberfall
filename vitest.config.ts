import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      /* The simulation now lives in js/sim.js and is loaded into the parity
         vm with an absolute filename, so v8 can attribute coverage to it.
         The facade (packages/sim/src/index.ts) is type-only plumbing. */
      include: ['js/sim.js'],
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
    },
  },
});
