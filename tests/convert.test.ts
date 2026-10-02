import { describe, expect, it } from 'vitest';
import { toDsl, toText, toTs } from '../src/convert';
import { parse } from '../src/parser';
import { evaluateTs } from '../src/tsmap';
import { extensionOf, languageOf } from '../src/language';
import { DEMOS } from '../src/demos';
import { model } from './helpers';

const demos = DEMOS.map((d) => [d.name, d.dsl] as const);

// a model that uses every construct, with names and strings that need care in both languages
const AWKWARD = model(`
  map "Billing & 'Friends'"
  context "Order Management" { subdomain core  question "It's \\ here?" }
  context "3PL" { promise - "x" from "Order Management" if "a 'quoted' reason" }
  context map
  context "API Gateway" { at -10 2.5  promise "to all" }
  context class { imposition "do it" on map }
  context "order-management"
  "Order Management" -> "3PL" { type "shared kernel"  upstream "OHS + PL"  downstream "type"  connascence name 3  connascence value distant }
  "map" -> class
`);

describe('model → DSL', () => {
  it.each(demos)('%s: parses back to the same model', (_name, dsl) => {
    const original = model(dsl);
    expect(parse(toDsl(original))).toEqual({ map: original, errors: [] });
  });

  it('quotes names and values the tokenizer would not read back as one word', () => {
    const dsl = toDsl(AWKWARD);
    expect(parse(dsl)).toEqual({ map: AWKWARD, errors: [] });
    expect(dsl).toContain('context "Order Management"');
    expect(dsl).toContain('context "map"');
    expect(dsl).toContain('downstream "type"'); // a bare keyword there would read as "value missing"
    expect(dsl).toContain('context order-management');
  });

  it('writes a bare model as bare lines and a single property inline', () => {
    expect(toDsl(model('map "M"\ncontext A\ncontext B\nA -> B\nB -> A { type partnership }'))).toBe(
      'map "M"\n\ncontext A\n\ncontext B\n\nA -> B\nB -> A { type partnership }\n'
    );
  });

  it('writes each kind of promise with the direction word that reads naturally', () => {
    const dsl = toDsl(model('context A { promise "g" to B  promise - "u" from B if "c"  imposition "i" on B  promise "all" }\ncontext B'));
    expect(dsl).toContain('promise + "g" to B');
    expect(dsl).toContain('promise - "u" from B if "c"');
    expect(dsl).toContain('imposition "i" on B');
    expect(dsl).toContain('promise + "all"\n');
  });

  it('swaps what a DSL string cannot hold — it has no escapes', () => {
    const { map: fromTs } = evaluateTs(
      `import { context, map } from 'context-map-evolver';\nexport default map('say "hi"', context('A', { questions: ['one\\n  two'] }));`
    );
    const dsl = toDsl(fromTs!);
    expect(dsl).toContain(`map "say 'hi'"`);
    expect(dsl).toContain('question "one two"');
    expect(parse(dsl).errors).toEqual([]);
  });
});

describe('model → TypeScript', () => {
  it.each(demos)('%s: evaluates back to the same model', (_name, dsl) => {
    const original = model(dsl);
    expect(evaluateTs(toTs(original))).toEqual({ map: original, errors: [] });
  });

  it('survives awkward names: spaces, digits, reserved words, quotes, clashes', () => {
    const ts = toTs(AWKWARD);
    expect(evaluateTs(ts)).toEqual({ map: AWKWARD, errors: [] });
    expect(ts).toContain(`const orderManagement = context('Order Management'`);
    expect(ts).toContain(`const _3pl = context('3PL')`);
    expect(ts).toContain(`const mapContext = context('map')`);
    expect(ts).toContain(`const apiGateway = context('API Gateway'`);
    expect(ts).toContain(`const classContext = context('class')`);
    expect(ts).toContain(`const orderManagement2 = context('order-management')`);
    expect(ts).toContain(`questions: ['It\\'s \\\\ here?']`);
    expect(Math.max(...ts.split('\n').map((line) => line.length))).toBeLessThanOrEqual(80);
  });

  it('reads like hand-written code', () => {
    const ts = toTs(
      model(`
        map "Media Rights Platform"
        context Legal { subdomain core  cynefin complex  promise "authoritative licensing rules" to Availability }
        context Availability
        Legal -> Availability { type customer-supplier  upstream OHS  connascence meaning distant 3  connascence value 2 }
        Availability -> Legal
      `)
    );
    expect(ts).toBe(`import { context, map } from 'context-map-evolver';

const legal = context('Legal', { subdomain: 'core', cynefin: 'complex' });
const availability = context('Availability');

legal.promises('authoritative licensing rules').to(availability);

legal.upstreamOf(availability, { type: 'customer-supplier', upstream: 'OHS' })
  .connascence('meaning', 'distant', 3)
  .connascence('value', 2);

availability.upstreamOf(legal);

export default map('Media Rights Platform', legal, availability);
`);
  });

  it('breaks long statements over several lines', () => {
    const ts = toTs(
      model(`
        context A { subdomain core  question "What is the first long question this context answers?"  question "And what is the second one?" }
        context B
        A -> B { type customer-supplier  upstream OHS  downstream ACL  integration "REST + events, nightly reconciliation"  coupling 2  connascence name }
      `)
    );
    expect(ts).toContain(`const a = context('A', {
  subdomain: 'core',
  questions: [
    'What is the first long question this context answers?',
    'And what is the second one?',
  ],
});`);
    expect(ts).toContain(`  coupling: 2,\n}).connascence('name');`);
    expect(Math.max(...ts.split('\n').map((line) => line.length))).toBeLessThanOrEqual(80);
  });

  it('keeps a reference to an undeclared context an error, as it was in the DSL', () => {
    const { map: broken, errors } = parse('context A { promise "x" to Ghost }\nA -> Phantom');
    expect(errors).toHaveLength(2);
    const ts = toTs(broken);
    expect(ts).toContain(`const ghost = context('Ghost'); // not on the map`);
    const back = evaluateTs(ts);
    expect(back.map).toEqual(broken);
    expect(back.errors).toEqual([
      "relation A -> Phantom: 'Phantom' is not passed to map()",
      `context 'A': promise "x" names 'Ghost', which is not passed to map()`,
    ]);
  });

  it('writes an imposition without its polarity, which nothing draws', () => {
    const original = model('context A { imposition - "x" on B }\ncontext B');
    const back = evaluateTs(toTs(original)).map!;
    expect(back.contexts[0].promises).toEqual([{ body: 'x', to: 'B', kind: 'imposition', polarity: '+' }]);
    // the DSL can say it, so that direction keeps it
    expect(parse(toDsl(original)).map).toEqual(original);
  });
});

describe('languages', () => {
  it('tells the language of a file from its name', () => {
    expect(languageOf('billing/payments.cme')).toBe('dsl');
    expect(languageOf('billing/payments.cme.ts')).toBe('ts');
    expect(languageOf('MAP.CME.TS')).toBe('ts');
    expect(languageOf('notes.txt')).toBe('dsl');
  });

  it('saves each language under its own extension', () => {
    expect(extensionOf('dsl')).toBe('.cme');
    expect(extensionOf('ts')).toBe('.cme.ts');
    expect(languageOf(`x${extensionOf('ts')}`)).toBe('ts');
  });

  it('converts to whichever language is asked for', () => {
    const m = model('map "M"\ncontext A');
    expect(toText(m, 'dsl')).toBe(toDsl(m));
    expect(toText(m, 'ts')).toBe(toTs(m));
  });
});
