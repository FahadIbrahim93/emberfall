import { defineConfig } from 'vitest/config';


export default defineConfig({
  test: {
    include: ['packages/**/tests/**/*.test.ts'],
  },
});

// Tests that need a DOM (e.g. render-core's canvas tests) should set up their own
// minimal environment or be skipped when running outside a browser context.
