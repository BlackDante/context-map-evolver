import { describe, expect, it } from 'vitest';
import { evaluateTs } from '../src/tsmap';

const HEAD = `import { context, map } from 'context-map-evolver';\n`;

describe('evaluating a TypeScript map file', () => {
  it('runs the file and returns the model of its default export', () => {
    const { map, errors } = evaluateTs(`${HEAD}
      const sales = context('Sales', { subdomain: 'core' });
      const billing = context('Billing');
      sales.upstreamOf(billing, { type: 'customer-supplier' });
      export default map('Ordering', sales, billing);
    `);
    expect(errors).toEqual([]);
    expect(map).toEqual({
      title: 'Ordering',
      contexts: [
        { name: 'Sales', subdomain: 'core', questions: [], promises: [] },
        { name: 'Billing', questions: [], promises: [] },
      ],
      relations: [{ source: 'Sales', target: 'Billing', type: 'customer-supplier', connascence: [] }],
    });
  });

  it('strips TypeScript syntax: annotations, type imports, interfaces, as / satisfies', () => {
    const { map, errors } = evaluateTs(`
      import { context, map, type ContextBuilder } from 'context-map-evolver';
      import type { Subdomain } from 'context-map-evolver';

      interface Team { name: string; kind: Subdomain }
      const teams: Team[] = [{ name: 'Sales', kind: 'core' }, { name: 'Billing', kind: 'generic' }];
      const contexts: ContextBuilder[] = teams.map((t) => context(t.name, { subdomain: t.kind } satisfies object));
      export default map('Teams' as string, ...contexts);
    `);
    expect(errors).toEqual([]);
    expect(map?.contexts.map((c) => [c.name, c.subdomain])).toEqual([['Sales', 'core'], ['Billing', 'generic']]);
  });

  it('is ordinary code: a map can be computed', () => {
    const { map, errors } = evaluateTs(`${HEAD}
      const names = ['A', 'B', 'C', 'D'];
      const all = names.map((n) => context(n));
      all.slice(1).forEach((c, i) => all[i].upstreamOf(c));
      export default map('Chain', ...all);
    `);
    expect(errors).toEqual([]);
    expect(map?.relations.map((r) => `${r.source}>${r.target}`)).toEqual(['A>B', 'B>C', 'C>D']);
  });

  it('passes on what the builder had to say, alongside the model', () => {
    const { map, errors } = evaluateTs(`${HEAD}
      const a = context('A', { subdomain: 'cor' });
      export default map('T', a);
    `);
    expect(errors).toEqual(["context 'A': subdomain must be core | supporting | generic"]);
    expect(map?.contexts).toHaveLength(1);
  });

  it('starts every evaluation from a clean slate', () => {
    const src = `${HEAD} const a = context('A'); const b = context('B'); a.upstreamOf(b); export default map('T', a, b);`;
    evaluateTs(src);
    expect(evaluateTs(src).map?.relations).toHaveLength(1);
  });

  it('reports a syntax error with its line and no model', () => {
    expect(evaluateTs(`${HEAD}\nconst a = context('A';\nexport default map('T', a);`)).toEqual({
      map: null,
      errors: [expect.stringMatching(/^line 3: /)],
    });
  });

  it('reports a runtime error with the line it was thrown on', () => {
    const { map, errors } = evaluateTs(`${HEAD}
      const a = context('A');

      a.promise('x');
      export default map('T', a);
    `);
    expect(map).toBeNull();
    expect(errors).toEqual(['line 5: TypeError: a.promise is not a function']);
  });

  it('finds the line in the map file even when the error surfaces inside a callback', () => {
    const { errors } = evaluateTs(`${HEAD}
      ['A'].forEach((n) => {
        missing(n);
      });
      export default map('T');
    `);
    expect(errors).toEqual(['line 4: ReferenceError: missing is not defined']);
  });

  it('reports thrown values that are not errors', () => {
    expect(evaluateTs(`throw 'nope';`).errors).toEqual(['the map file threw nope']);
  });

  it('requires a map as the default export', () => {
    const message = `a map file must end with 'export default map("Title", …contexts)'`;
    expect(evaluateTs(`${HEAD} const a = context('A');`)).toEqual({ map: null, errors: [message] });
    expect(evaluateTs(`${HEAD} export default context('A');`).errors).toEqual([message]);
    expect(evaluateTs(`${HEAD} export const m = map('T');`).errors).toEqual([message]);
    expect(evaluateTs('').errors).toEqual([message]);
  });

  it('refuses every import except the builder', () => {
    expect(evaluateTs(`import fs from 'node:fs';\nfs.readFileSync('/etc/passwd');`).errors).toEqual([
      "line 1: Error: cannot import 'node:fs' — a map file can only import 'context-map-evolver'",
    ]);
    expect(evaluateTs(`import { shared } from './shared';\nexport default shared;`).errors[0]).toContain(
      "cannot import './shared'"
    );
    expect(evaluateTs(`import './side-effect';`).errors[0]).toContain("cannot import './side-effect'");
  });

  it('drops an import nothing uses, as the TypeScript compiler would', () => {
    expect(evaluateTs(`import { unused } from './elsewhere';\n${HEAD} export default map('T');`).errors).toEqual([]);
  });
});
