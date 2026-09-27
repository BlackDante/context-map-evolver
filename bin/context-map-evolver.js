#!/usr/bin/env node
// Thin launcher: the real CLI is bundled by `npm run build` into dist/cli/index.js.
import { existsSync } from 'node:fs';

const entry = new URL('../dist/cli/index.js', import.meta.url);
if (!existsSync(entry)) {
  console.error('context-map-evolver: the CLI bundle is missing — run `npm run build` first.');
  process.exit(1);
}
const { run } = await import(entry.href);
process.exitCode = await run(process.argv.slice(2));
