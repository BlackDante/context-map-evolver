import { defineConfig } from 'vite';

// Bundles the CLI (cli/main.ts) for Node into dist/cli/index.js. Runs after the
// app build, which empties dist/ — this one only clears its own subfolder.
export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'cli/main.ts',
    target: 'node20',
    outDir: 'dist/cli',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      output: { entryFileNames: 'index.js', format: 'es' },
    },
  },
});
