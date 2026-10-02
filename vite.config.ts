import { defineConfig } from 'vitest/config';

// base: './' makes all asset URLs in the built index.html relative, so the
// site works whether it's served from a domain root or a subfolder (GitHub
// Pages project sites, shared hosting). No server-side config required — it's
// static.
export default defineConfig({
  base: './',
  // the TypeScript evaluator (src/tsworker.ts) is a module worker
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.ts', 'cli/**/*.ts'],
      // DOM wiring, process wiring and static sample data; everything else is pure and tested
      exclude: ['src/main.ts', 'src/tsworker.ts', 'src/vite-env.d.ts', 'cli/main.ts', 'cli/open.ts'],
    },
  },
});
