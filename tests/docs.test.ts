import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '../src/parser';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** Fenced code blocks without a language tag that are complete models (they declare a `map`). */
function models(markdown: string): string[] {
  return [...markdown.matchAll(/^```(\w*)\n([\s\S]*?)^```/gm)]
    .filter((m) => m[1] === '') // ```bash blocks are shell, not DSL
    .map((m) => m[2])
    .filter((src) => /^map "/m.test(src) && !src.includes('…'));
}

describe('documentation stays true to the parser', () => {
  it.each(['README.md', 'docs/DSL.md'])('every complete model in %s parses cleanly', (file) => {
    const found = models(read(file));
    expect(found.length).toBeGreaterThan(0);
    for (const src of found) expect(parse(src).errors, src).toEqual([]);
  });

  it.each(readdirSync(new URL('../examples', import.meta.url)).filter((f) => f.endsWith('.cme')))(
    'examples/%s parses cleanly',
    (file) => {
      const { map, errors } = parse(read(`examples/${file}`));
      expect(errors).toEqual([]);
      expect(map.contexts.length).toBeGreaterThan(0);
    }
  );

  it('covers every keyword of the language in the reference', () => {
    const doc = read('docs/DSL.md');
    for (const kw of ['map', 'context', 'subdomain', 'cynefin', 'question', 'promise', 'imposition', 'at', 'type', 'upstream', 'downstream', 'integration', 'coupling', 'connascence']) {
      expect(doc, `DSL.md should mention '${kw}'`).toContain(`\`${kw}`);
    }
  });
});
