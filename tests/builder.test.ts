import { describe, expect, it } from 'vitest';
import { context, map, ContextBuilder, MapDefinition } from '../src/builder';
import { parse } from '../src/parser';

/** A map that is expected to build cleanly. */
function built(title: string, ...contexts: ContextBuilder[]) {
  const { map: model, errors } = map(title, ...contexts).toModel();
  expect(errors).toEqual([]);
  return model;
}

/** Just the problems. */
const issues = (...contexts: ContextBuilder[]) => map('T', ...contexts).toModel().errors;

describe('builder — the same model as the DSL', () => {
  it('builds exactly what the parser builds from the equivalent text', () => {
    const legal = context('Legal', {
      subdomain: 'core',
      cynefin: 'complex',
      questions: ['When can a license be used, and where?'],
    });
    const availability = context('Availability', { subdomain: 'supporting', at: [400, 200] });
    legal.promises('authoritative licensing rules').to(availability);
    availability.uses('authoritative licensing rules').from(legal).if('the license is active');
    availability.imposes('weekly export').on(legal);
    legal
      .upstreamOf(availability, { type: 'customer-supplier', upstream: 'OHS', downstream: 'ACL', integration: 'REST', coupling: 2 })
      .connascence('meaning', 'distant', 3)
      .connascence('value', 'distant', 2);

    const fromDsl = parse(`
      map "Media Rights Platform"
      context Legal {
        subdomain core
        cynefin complex
        question "When can a license be used, and where?"
        promise + "authoritative licensing rules" to Availability
      }
      context Availability {
        subdomain supporting
        at 400 200
        promise - "authoritative licensing rules" from Legal if "the license is active"
        imposition "weekly export" on Legal
      }
      Legal -> Availability {
        type customer-supplier  upstream OHS  downstream ACL  integration "REST"  coupling 2
        connascence meaning distant 3
        connascence value distant 2
      }`);
    expect(fromDsl.errors).toEqual([]);
    expect(built('Media Rights Platform', legal, availability)).toEqual(fromDsl.map);
  });

  it('draws contexts in the order they are passed to map()', () => {
    const [a, b, c] = ['A', 'B', 'C'].map((n) => context(n));
    expect(built('T', c, a, b).contexts.map((x) => x.name)).toEqual(['C', 'A', 'B']);
  });

  it('keeps relations in the order they were declared, whichever context declares them', () => {
    const [a, b, c] = ['A', 'B', 'C'].map((n) => context(n));
    b.upstreamOf(c, { type: 'first' });
    a.upstreamOf(b, { type: 'second' });
    b.upstreamOf(a, { type: 'third' });
    expect(built('T', a, b, c).relations.map((r) => r.type)).toEqual(['first', 'second', 'third']);
  });

  it('allows several relations between the same pair', () => {
    const [a, b] = [context('A'), context('B')];
    a.upstreamOf(b, { integration: 'create payment' });
    a.upstreamOf(b, { integration: 'payment completed' });
    expect(built('T', a, b).relations).toHaveLength(2);
  });

  it('makes a promise to everyone when no counterpart is named', () => {
    const identity = context('Identity');
    identity.promises('tokens are valid for 15 minutes');
    expect(built('T', identity).contexts[0].promises).toEqual([
      { body: 'tokens are valid for 15 minutes', kind: 'promise', polarity: '+' },
    ]);
  });

  it('takes locality and degree of a connascence in either order, or alone', () => {
    const [a, b] = [context('A'), context('B')];
    a.upstreamOf(b).connascence('name').connascence('type', 'distant').connascence('value', 4).connascence('timing', 'local', 0);
    // not offered by the types, but it is what the DSL accepts and the browser runs untyped code
    (a.upstreamOf(b).connascence as (...args: unknown[]) => unknown)('identity', 5, 'distant');
    const [first, second] = built('T', a, b).relations;
    expect(first.connascence).toEqual([
      { kind: 'name' },
      { kind: 'type', locality: 'distant' },
      { kind: 'value', degree: 4 },
      { kind: 'timing', locality: 'local', degree: 0 },
    ]);
    expect(second.connascence).toEqual([{ kind: 'identity', locality: 'distant', degree: 5 }]);
  });

  it('hands out a model that later builder calls do not change', () => {
    const [a, b] = [context('A'), context('B')];
    const relation = a.upstreamOf(b);
    const before = built('T', a, b);
    a.promises('late');
    relation.connascence('name');
    expect(before.contexts[0].promises).toEqual([]);
    expect(before.relations[0].connascence).toEqual([]);
    expect(built('T', a, b).contexts[0].promises).toHaveLength(1);
  });

  it('exposes the factory results as classes, for instanceof and for typing', () => {
    expect(context('A')).toBeInstanceOf(ContextBuilder);
    expect(map('T')).toBeInstanceOf(MapDefinition);
    expect(context('A').name).toBe('A');
  });
});

// The browser editor runs map files without type-checking them, so everything
// the types would catch has to be caught again at run time — as a message, not a throw.
describe('builder — problems are reported, never thrown', () => {
  const loose = context as (...args: unknown[]) => ContextBuilder;

  it('rejects unknown enum values but keeps the context', () => {
    const a = loose('A', { subdomain: 'cor', cynefin: 'simple' });
    const { map: model, errors } = map('T', a).toModel();
    expect(errors).toEqual([
      "context 'A': subdomain must be core | supporting | generic",
      "context 'A': cynefin must be clear | complicated | complex | chaotic | disorder",
    ]);
    expect(model.contexts).toEqual([{ name: 'A', questions: [], promises: [] }]);
  });

  it('does not take inherited object keys for enum values', () => {
    expect(issues(loose('A', { subdomain: 'constructor' }))).toHaveLength(1);
  });

  it('names a mistyped option instead of ignoring it', () => {
    expect(issues(loose('A', { subdomian: 'core' }))).toEqual([
      "context 'A': unknown option 'subdomian' — expected subdomain | cynefin | questions | at",
    ]);
    const [a, b] = [context('A'), context('B')];
    (a.upstreamOf as (...args: unknown[]) => unknown)(b, { kind: 'conformist' });
    expect(issues(a, b)).toEqual([
      "relation A -> B: unknown option 'kind' — expected type | upstream | downstream | integration | coupling",
    ]);
  });

  it('validates questions, coordinates and the options bag itself', () => {
    expect(issues(loose('A', { questions: 'why?' }))).toEqual(["context 'A': questions expects a list of strings"]);
    expect(issues(loose('A', { questions: ['ok', 3] }))).toEqual(["context 'A': questions expects a list of strings"]);
    expect(issues(loose('A', { at: [1] }))).toEqual(["context 'A': at expects two numbers, e.g. at: [400, 200]"]);
    expect(issues(loose('A', { at: [1, NaN] }))).toHaveLength(1);
    expect(issues(loose('A', 'core'))).toEqual(["context 'A': options must be an object, got 'core'"]);
    expect(issues(loose('A', null))).toEqual([]);
  });

  it('leaves a context without a name off the map', () => {
    const { map: model, errors } = map('T', loose(''), loose(42)).toModel();
    expect(errors).toEqual(["context() expects a name, got ''", 'context() expects a name, got 42']);
    expect(model.contexts.map((c) => c.name)).toEqual(['42']);
  });

  it('validates relation options', () => {
    const [a, b] = [context('A'), context('B')];
    const upstreamOf = a.upstreamOf.bind(a) as (...args: unknown[]) => unknown;
    upstreamOf(b, { coupling: 0 });
    upstreamOf(b, { coupling: '2', type: '' });
    upstreamOf(b, { integration: 7 });
    const { map: model, errors } = map('T', a, b).toModel();
    expect(errors).toEqual([
      'relation A -> B: coupling expects a positive number',
      'relation A -> B: type expects a non-empty string',
      'relation A -> B: coupling expects a positive number',
      'relation A -> B: integration expects a non-empty string',
    ]);
    expect(model.relations).toHaveLength(3); // each kept, minus what was wrong with it
  });

  it('reports a connascence it does not understand and keeps the rest of the chain', () => {
    const [a, b] = [context('A'), context('B')];
    const relation = a.upstreamOf(b) as unknown as { connascence(...args: unknown[]): typeof relation };
    relation.connascence('naming').connascence('name', 'far', 2.5).connascence('value', 'distant');
    const { map: model, errors } = map('T', a, b).toModel();
    expect(errors).toEqual([
      "relation A -> B: unknown connascence kind 'naming' — expected name | type | meaning | position | algorithm | execution | timing | value | identity",
      "relation A -> B: connascence name takes 'local' | 'distant' and a whole-number degree, got 'far'",
      "relation A -> B: connascence name takes 'local' | 'distant' and a whole-number degree, got 2.5",
    ]);
    expect(model.relations[0].connascence).toEqual([{ kind: 'name' }, { kind: 'value', locality: 'distant' }]);
  });

  it('survives a relation to something that is not a context', () => {
    const a = context('A');
    const chained = (a.upstreamOf as (...args: unknown[]) => { connascence(kind: string): unknown })('B');
    expect(() => chained.connascence('name')).not.toThrow();
    const { map: model, errors } = map('T', a).toModel();
    expect(errors).toEqual(["context 'A': upstreamOf() expects a context, got 'B'"]);
    expect(model.relations).toEqual([]);
  });

  it('validates promises: body, counterpart and condition', () => {
    const [a, b] = [context('A'), context('B')];
    (a.promises as (...args: unknown[]) => unknown)();
    (a.uses('x').from as (...args: unknown[]) => unknown)('B');
    (a.imposes('y').on(b).if as (...args: unknown[]) => unknown)(true);
    const { map: model, errors } = map('T', a, b).toModel();
    expect(errors).toEqual([
      "context 'A': promises() expects the body as a string, e.g. promises('fresh prices')",
      `context 'A': uses("x").from() expects a context, got 'B'`,
      `context 'A': imposes("y").if() expects the condition as a string`,
    ]);
    expect(model.contexts[0].promises).toEqual([
      { body: 'x', kind: 'promise', polarity: '-' },
      { body: 'y', kind: 'imposition', polarity: '+', to: 'B' },
    ]);
  });

  it('accepts to / from / on interchangeably at run time, like the DSL', () => {
    const [a, b] = [context('A'), context('B')];
    (a.promises('x') as unknown as { from(c: ContextBuilder): unknown }).from(b);
    expect(built('T', a, b).contexts[0].promises[0].to).toBe('B');
  });

  it('reports what map() itself was given', () => {
    const a = context('A');
    const loose = map as (...args: unknown[]) => MapDefinition;
    expect(loose(a).toModel().errors).toEqual(["map() expects a title as its first argument, got context 'A'"]);
    expect(loose(a).toModel().map.title).toBe('Untitled map');
    expect(loose('T', a, 'B', [a], { name: 'C' }, undefined).toModel().errors).toEqual([
      "map() expects contexts after the title, got 'B'",
      'map() expects contexts after the title, got an array',
      'map() expects contexts after the title, got an object',
      'map() expects contexts after the title, got undefined',
    ]);
  });

  it('ignores a second context with the same name', () => {
    const { map: model, errors } = map('T', context('A', { subdomain: 'core' }), context('A', { subdomain: 'generic' })).toModel();
    expect(errors).toEqual(["duplicate context 'A' — ignored"]);
    expect(model.contexts).toHaveLength(1);
    expect(model.contexts[0].subdomain).toBe('core');
  });

  it('reports references to contexts that were left off the map', () => {
    const [a, b] = [context('A'), context('B')];
    a.upstreamOf(b);
    a.promises('x').to(b);
    const { map: model, errors } = map('T', a).toModel();
    expect(errors).toEqual([
      "relation A -> B: 'B' is not passed to map()",
      `context 'A': promise "x" names 'B', which is not passed to map()`,
    ]);
    expect(model.relations).toHaveLength(1); // kept, like the parser keeps it — just not drawn
  });

  it('does not bring along the relations of a context that is off the map', () => {
    const [a, b] = [context('A'), context('B')];
    b.upstreamOf(a);
    expect(built('T', a).relations).toEqual([]);
  });

  it('rejects a relation or a promise from a context to itself', () => {
    const a = context('A');
    a.upstreamOf(a);
    a.imposes('x').on(a);
    expect(issues(a)).toEqual(["'A' cannot have a relation with itself", "'A' cannot make a imposition to itself"]);
  });
});
