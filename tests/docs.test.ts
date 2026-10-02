import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '../src/parser';
import { evaluateTs } from '../src/tsmap';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** Fenced code blocks without a language tag that are complete models (they declare a `map`). */
function models(markdown: string): string[] {
  return [...markdown.matchAll(/^```(\w*)\n([\s\S]*?)^```/gm)]
    .filter((m) => m[1] === '') // ```bash blocks are shell, not DSL
    .map((m) => m[2])
    .filter((src) => /^map "/m.test(src) && !src.includes('…'));
}

/** ```ts blocks that are complete map files (from the import to the exported map), not fragments. */
function tsModels(markdown: string): string[] {
  return [...markdown.matchAll(/^```ts\n([\s\S]*?)^```/gm)]
    .map((m) => m[1])
    .filter((src) => src.includes('import {') && src.includes('export default map('));
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

describe('documentation stays true to the TypeScript builder', () => {
  const examples = readdirSync(new URL('../examples', import.meta.url));

  it.each(['README.md', 'docs/TYPESCRIPT.md'])('every complete map file in %s runs cleanly', (file) => {
    const found = tsModels(read(file));
    expect(found.length).toBeGreaterThan(0);
    for (const src of found) expect(evaluateTs(src).errors, src).toEqual([]);
  });

  it.each(examples.filter((f) => f.endsWith('.cme')))('examples/%s has a TypeScript twin that builds the same model', (file) => {
    expect(examples).toContain(`${file}.ts`);
    expect(evaluateTs(read(`examples/${file}.ts`))).toEqual({ map: parse(read(`examples/${file}`)).map, errors: [] });
  });

  it('introduces both languages in the README with the same model', () => {
    const readme = read('README.md');
    expect(evaluateTs(tsModels(readme)[0])).toEqual(parse(models(readme)[0]));
  });

  it('shows the same model in both languages where it sets them side by side', () => {
    const section = read('docs/TYPESCRIPT.md').split('## DSL ↔ TypeScript')[1].split('\n## ')[0];
    const [dsl] = models(section);
    const [ts] = tsModels(section);
    expect(evaluateTs(ts)).toEqual(parse(dsl));
  });

  it('covers the whole vocabulary of the builder in the reference', () => {
    const doc = read('docs/TYPESCRIPT.md');
    const vocabulary = [
      'context(', 'map(', '.promises(', '.uses(', '.imposes(', '.to(', '.from(', '.on(', '.if(', '.upstreamOf(', '.connascence(',
      '`subdomain`', '`cynefin`', '`questions`', '`at`', '`type`', '`upstream`', '`downstream`', '`integration`', '`coupling`',
    ];
    for (const word of vocabulary) expect(doc, `TYPESCRIPT.md should mention ${word}`).toContain(word);
  });

  it('quotes error messages the way the app words them', () => {
    const doc = read('docs/TYPESCRIPT.md').replace(/\\\|/g, '|'); // table cells escape the pipe
    const two = `${HEAD} const a = context('A'), b = context('B');`;
    // [a map file with one mistake, the message as the reference quotes it]
    const cases = [
      [`export default 1;`, `a map file must end with 'export default map("Title", …contexts)'`],
      [`import x from 'x'; x();`, `cannot import 'x' — a map file can only import 'context-map-evolver'`],
      [`${HEAD} export default map('T', context('X', { subdomain: 'cor' }));`, `context 'X': subdomain must be core | supporting | generic`],
      [`${HEAD} export default map('T', context('X', { x: 1 }));`, `context 'X': unknown option 'x'`],
      [`${HEAD} export default map('T', context('X', { questions: 1 }));`, `context 'X': questions expects a list of strings`],
      [`${HEAD} export default map('T', context('X', { at: 1 }));`, `context 'X': at expects two numbers`],
      [`${HEAD} export default map('T', context(''));`, `context() expects a name`],
      [`${HEAD} const x = context('X'); x.promises(); export default map('T', x);`, `context 'X': promises() expects the body as a string`],
      [`${HEAD} const x = context('X'); x.promises('…').to('B'); export default map('T', x);`, `context 'X': promises("…").to() expects a context`],
      [`${HEAD} const x = context('X'); x.upstreamOf('B'); export default map('T', x);`, `context 'X': upstreamOf() expects a context`],
      [`${two} a.upstreamOf(b, { x: 1 }); export default map('T', a, b);`, `relation A -> B: unknown option 'x'`],
      [`${two} a.upstreamOf(b, { coupling: 0 }); export default map('T', a, b);`, `relation A -> B: coupling expects a positive number`],
      [`${two} a.upstreamOf(b).connascence('x'); export default map('T', a, b);`, `relation A -> B: unknown connascence kind 'x'`],
      [`${two} export default map(a, b);`, `map() expects a title as its first argument`],
      [`${two} export default map('T', a, 'B');`, `map() expects contexts after the title`],
      [`${HEAD} export default map('T', context('X'), context('X'));`, `duplicate context 'X' — ignored`],
      [`${two} a.upstreamOf(b); export default map('T', a);`, `relation A -> B: 'B' is not passed to map()`],
      [`${two} a.promises('…').to(b); export default map('T', a);`, `context 'A': promise "…" names 'B', which is not passed to map()`],
      [`${HEAD} const x = context('X'); x.upstreamOf(x); export default map('T', x);`, `'X' cannot have a relation with itself`],
    ];
    for (const [src, message] of cases) {
      expect(evaluateTs(src).errors.join('\n'), src).toContain(message);
      expect(doc, `TYPESCRIPT.md should list: ${message}`).toContain(message);
    }
  });
});

const HEAD = `import { context, map } from 'context-map-evolver';`;
