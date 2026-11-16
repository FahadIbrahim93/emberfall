import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      /* This instruments the FACADE, not the simulation. The simulation is
         plain JavaScript inside index.html, which v8 cannot instrument here;
         it is covered by the per-tick parity and golden gates instead
         (tools/parity.test.mjs and packages/sim/tests/parity-shipped.test.ts).
         types.ts is declarations only and would report 0/0. */
      include: ['packages/sim/src/index.ts'],
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
    },
  },
});
