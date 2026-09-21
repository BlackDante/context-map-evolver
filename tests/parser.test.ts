import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser';
import { DEMOS } from '../src/demos';

const ok = (src: string) => {
  const r = parse(src);
  expect(r.errors).toEqual([]);
  return r.map;
};

describe('demos', () => {
  it.each(DEMOS.map((d) => [d.name, d.dsl] as const))('%s parses without issues', (_n, dsl) => {
    expect(parse(dsl).errors).toEqual([]);
  });
});

describe('map & contexts', () => {
  it('defaults the title and accepts an empty model', () => {
    expect(ok('')).toEqual({ title: 'Untitled map', contexts: [], relations: [] });
  });

  it('reads the title', () => {
    expect(ok('map "Media Rights"').title).toBe('Media Rights');
  });

  it('accepts bare contexts, with or without a block', () => {
    expect(ok('context A\ncontext B {}\ncontext C { }').contexts.map((c) => c.name)).toEqual(['A', 'B', 'C']);
  });

  it('accepts quoted names with spaces', () => {
    expect(ok('context "Order Mgmt"').contexts[0].name).toBe('Order Mgmt');
  });

  it('reads every context property', () => {
    const [c] = ok(`context Legal {
      subdomain core
      cynefin complex
      question "One?"
      question "Two?"
      at 400 -20.5
    }`).contexts;
    expect(c).toMatchObject({ subdomain: 'core', cynefin: 'complex', questions: ['One?', 'Two?'], x: 400, y: -20.5 });
  });

  it('does not care about line breaks', () => {
    expect(ok('context A { subdomain core cynefin clear }').contexts[0]).toMatchObject({
      subdomain: 'core',
      cynefin: 'clear',
    });
  });
});

describe('comments', () => {
  it('strips # and // comments, full-line and trailing', () => {
    const m = ok('# one\n// two\ncontext A // trailing\ncontext B # trailing');
    expect(m.contexts.map((c) => c.name)).toEqual(['A', 'B']);
  });

  it('keeps comment markers that appear inside strings', () => {
    const m = ok('context A { question "see http://x.io #42" }');
    expect(m.contexts[0].questions).toEqual(['see http://x.io #42']);
  });
});

describe('promises', () => {
  const promises = (body: string) => ok(`context A {\n${body}\n}\ncontext B`).contexts[0].promises;

  it('defaults to a (+) promise to everyone', () => {
    expect(promises('promise "uptime"')).toEqual([
      { body: 'uptime', kind: 'promise', polarity: '+', to: undefined, condition: undefined },
    ]);
  });

  it('reads polarity, promisee and condition', () => {
    expect(promises('promise - "labels" from B if "v2 only"')[0]).toEqual({
      body: 'labels',
      kind: 'promise',
      polarity: '-',
      to: 'B',
      condition: 'v2 only',
    });
  });

  it('treats to / from / on as interchangeable direction words', () => {
    for (const dir of ['to', 'from', 'on']) expect(promises(`promise "x" ${dir} B`)[0].to).toBe('B');
  });

  it('reads impositions', () => {
    expect(promises('imposition "use our format" on B')[0]).toMatchObject({ kind: 'imposition', to: 'B' });
  });

  it('accepts a sign glued to the body', () => {
    expect(promises('promise -"x" from B')[0].polarity).toBe('-');
  });

  it('accepts a quoted promisee (names with spaces)', () => {
    const m = ok('context "Order Mgmt"\ncontext B { promise "x" to "Order Mgmt" }');
    expect(m.contexts[1].promises[0].to).toBe('Order Mgmt');
  });
});

describe('relations', () => {
  const CTX = 'context A\ncontext B\n';

  it('reads a bare relation as upstream -> downstream', () => {
    expect(ok(`${CTX}A -> B`).relations).toEqual([{ source: 'A', target: 'B', connascence: [] }]);
  });

  it('does not need spaces around the arrow', () => {
    expect(ok(`${CTX}A->B`).relations).toHaveLength(1);
  });

  it('keeps hyphenated words whole', () => {
    expect(ok(`${CTX}A -> B { type customer-supplier }`).relations[0].type).toBe('customer-supplier');
  });

  it('reads every relation property', () => {
    const [r] = ok(`${CTX}A -> B {
      type customer-supplier
      upstream OHS
      downstream ACL
      integration "REST + events"
      coupling 2.5
      connascence meaning distant 3
      connascence value
    }`).relations;
    expect(r).toEqual({
      source: 'A',
      target: 'B',
      type: 'customer-supplier',
      upstreamRole: 'OHS',
      downstreamRole: 'ACL',
      integration: 'REST + events',
      coupling: 2.5,
      connascence: [{ kind: 'meaning', locality: 'distant', degree: 3 }, { kind: 'value' }],
    });
  });

  it('accepts connascence locality and degree in either order', () => {
    const [r] = ok(`${CTX}A -> B { connascence timing 4 local }`).relations;
    expect(r.connascence).toEqual([{ kind: 'timing', locality: 'local', degree: 4 }]);
  });

  it("accepts 'type' as a connascence kind even though it is also a keyword", () => {
    const [r] = ok(`${CTX}A -> B { connascence type distant 2 }`).relations;
    expect(r.connascence[0].kind).toBe('type');
    expect(r.type).toBeUndefined();
  });

  it('accepts quoted labels and endpoints', () => {
    const m = ok('context "Order Mgmt"\ncontext B\n"Order Mgmt" -> B { type "shared kernel" }');
    expect(m.relations[0]).toMatchObject({ source: 'Order Mgmt', type: 'shared kernel' });
  });

  it('keeps parallel and opposite relations as separate entries', () => {
    expect(ok(`${CTX}A -> B\nA -> B\nB -> A`).relations).toHaveLength(3);
  });
});

describe('error reporting', () => {
  const errors = (src: string) => parse(src).errors;

  it.each([
    ['map', "line 1: 'map' expects a quoted title"],
    ['context', "line 1: 'context' expects a name"],
    ['context A { subdomain huge }', 'line 1: subdomain must be core | supporting | generic'],
    ['context A { cynefin simple }', 'line 1: cynefin must be clear | complicated | complex | chaotic | disorder'],
    ['context A { question }', "line 1: 'question' expects a quoted string"],
    ['context A { promise to A }', "line 1: 'promise' expects a quoted body"],
    ['context A { at 100 }', "line 1: 'at' expects two numbers"],
    ['context A { colour red }', "line 1: unknown context property 'colour'"],
    ['context A\nA ->', "line 2: relation target expected after '->'"],
    ['context A\ncontext B\nA -> B { coupling 0 }', 'line 3: coupling expects a positive number'],
    ['context A\ncontext B\nA -> B { coupling lots }', 'line 3: coupling expects a positive number'],
    ['context A\ncontext B\nA -> B { connascence vibes }', "line 3: unknown connascence kind 'vibes'"],
    ['context A\ncontext B\nA -> B { integration REST }', "line 3: 'integration' expects a quoted string"],
    ['context A\ncontext B\nA -> B { weight 3 }', "line 3: unknown relation property 'weight'"],
    ['context A\nA -> Ghost', "line 2: relation references unknown context 'Ghost'"],
    ['context A\nA -> A', "line 2: 'A' cannot have a relation with itself"],
    ['context A { promise "x" to Ghost }', "line 1: promise references unknown context 'Ghost'"],
    ['context A { imposition "x" on A }', "line 1: 'A' cannot make a imposition to itself"],
    ['context A\n\ncontext A', "line 3: duplicate context 'A' (first declared on line 1)"],
    ['map "oops', 'line 1: unterminated string'],
    ['stray', "line 1: unexpected 'stray'"],
    ['}', "line 1: unexpected '}'"],
  ])('%j → %s', (src, message) => {
    expect(errors(src).join('\n')).toContain(message);
  });

  it('prefixes every message with its line', () => {
    const all = errors('map\ncontext A { nope }\nA -> Ghost { nope }\ncontext A\n}');
    expect(all.length).toBeGreaterThan(3);
    for (const e of all) expect(e).toMatch(/^line \d+: /);
  });

  it('reports an unknown endpoint once per relation, not once per side', () => {
    expect(errors('Ghost -> Ghost')).toEqual([
      "line 1: relation references unknown context 'Ghost'",
      "line 1: 'Ghost' cannot have a relation with itself",
    ]);
  });
});

describe('error recovery — the map keeps rendering while you type', () => {
  it('a missing map title does not swallow the next declaration', () => {
    expect(parse('map\ncontext A').map.contexts.map((c) => c.name)).toEqual(['A']);
  });

  it("an incomplete 'at' does not swallow the next property", () => {
    const { map, errors } = parse('context A { at 100\n subdomain core }');
    expect(map.contexts[0]).toMatchObject({ subdomain: 'core' });
    expect(map.contexts[0].x).toBeUndefined();
    expect(errors).toHaveLength(1);
  });

  it("an empty 'at' does not pin the context to 0,0", () => {
    const [c] = parse('context A { at }').map.contexts;
    expect(c.x).toBeUndefined();
    expect(c.y).toBeUndefined();
  });

  it('a missing label value does not swallow the next keyword', () => {
    const { map, errors } = parse('context A\ncontext B\nA -> B { type\n upstream OHS }');
    expect(map.relations[0]).toMatchObject({ upstreamRole: 'OHS' });
    expect(map.relations[0].type).toBeUndefined();
    expect(errors).toEqual(["line 3: 'type' expects a value"]);
  });

  it('a forgotten } ends the block at the next declaration instead of eating it', () => {
    const { map, errors } = parse('context A {\n subdomain core\ncontext B\nA -> B');
    expect(map.contexts.map((c) => c.name)).toEqual(['A', 'B']);
    expect(map.relations).toHaveLength(1);
    expect(errors).toEqual(["line 1: context 'A' is missing its closing '}'"]);
  });

  it('a forgotten } on a relation block recovers the same way', () => {
    const { map, errors } = parse('context A\ncontext B\nA -> B { type x\nB -> A');
    expect(map.relations).toHaveLength(2);
    expect(errors).toEqual(["line 3: relation A -> B is missing its closing '}'"]);
  });

  it('keeps the first of two duplicate contexts', () => {
    const { map } = parse('context A { subdomain core }\ncontext A { subdomain generic }');
    expect(map.contexts).toHaveLength(1);
    expect(map.contexts[0].subdomain).toBe('core');
  });

  it('keeps valid properties around an invalid one', () => {
    const { map, errors } = parse('context A { subdomain nope  cynefin clear }');
    expect(map.contexts[0]).toMatchObject({ cynefin: 'clear' });
    expect(errors).toHaveLength(1);
  });

  it('rejects inherited object keys posing as enum values', () => {
    const src = 'context A { subdomain constructor  cynefin toString }\ncontext B\nA -> B { connascence valueOf }';
    const { map, errors } = parse(src);
    expect(errors).toHaveLength(3);
    expect(map.contexts[0].subdomain).toBeUndefined();
    expect(map.relations[0].connascence).toEqual([]);
  });

  it('never throws, whatever the input', () => {
    const junk = ['{', '}}}{{{', '->', '-> ->', '"', 'context {', 'A -> {', 'context A { promise + }', 'map map map'];
    for (const src of junk) expect(() => parse(src)).not.toThrow();
  });

  it('terminates on every prefix of a real model (simulated typing)', () => {
    const dsl = DEMOS.find((d) => d.id === 'full')!.dsl;
    for (let i = 0; i <= dsl.length; i += 7) expect(() => parse(dsl.slice(0, i))).not.toThrow();
  });
});
