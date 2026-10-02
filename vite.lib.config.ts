import { defineConfig } from 'vite';

// Bundles the builder API (src/builder.ts) into dist/lib/builder.js — what
// `import { context, map } from 'context-map-evolver'` resolves to. Its types
// are emitted next to it by `tsc -p tsconfig.lib.json`. Runs after the app
// build, which empties dist/ — this one only clears its own subfolder.
export default defineConfig({
  publicDir: false,
  build: {
    lib: { entry: 'src/builder.ts', formats: ['es'], fileName: 'builder' },
    target: 'es2022',
    outDir: 'dist/lib',
    emptyOutDir: true,
    minify: false,
  },
});
