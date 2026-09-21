// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '../src/render';
import { DEMOS } from '../src/demos';
import { LEVELS } from '../src/levels';
import { parse } from '../src/parser';
import { ALL_ON, L0, L1, L2, L3, attr, model, pathNumbers, svg, toDoc } from './helpers';

// Two contexts pinned on a horizontal line: geometry becomes predictable, so
// assertions can talk about "above" and "below" the straight A–B line.
const PAIR = `
context A { at 0 0 }
context B { at 600 0 }
`;

describe('SVG document', () => {
  it.each(DEMOS.flatMap((d) => LEVELS.map((l) => [d.name, l.name, d.dsl, l.layers] as const)))(
    '%s at %s is well-formed and free of junk values',
    (_demo, _level, dsl, layers) => {
      const markup = render(model(dsl), layers, 1);
      toDoc(markup); // throws on malformed XML
      expect(markup).not.toMatch(/NaN|Infinity|undefined|null/);
    }
  );

  it('is a standalone SVG: namespace, viewBox matching its size, a title', () => {
    const s = svg(`map "My map"\n${PAIR}`, L0);
    expect(s.root.tagName).toBe('svg');
    expect(s.root.namespaceURI).toBe('http://www.w3.org/2000/svg');
    const { w, h } = s.size();
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
    expect(s.root.getAttribute('viewBox')).toBe(`0 0 ${w} ${h}`);
    expect(s.root.querySelector('title')?.textContent).toBe('My map');
  });

  it('defines every marker and filter it references', () => {
    const s = svg(DEMOS.find((d) => d.id === 'full')!.dsl, ALL_ON);
    const refs = [...s.markup.matchAll(/url\(#([\w-]+)\)/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const id of new Set(refs)) {
      expect(s.root.querySelector(`[id="${id}"]`), `#${id} is referenced but not defined`).not.toBeNull();
    }
  });

  it('keeps every node inside the canvas, with padding', () => {
    const s = svg(DEMOS.find((d) => d.id === 'full')!.dsl, L1);
    const { w, h } = s.size();
    for (const c of ['Legal', 'Availability', 'Library', 'Orders', 'Payments']) {
      const b = s.box(c);
      expect(b.x).toBeGreaterThanOrEqual(60 - 0.1);
      expect(b.y).toBeGreaterThanOrEqual(60 - 0.1);
      expect(b.x + b.w).toBeLessThanOrEqual(w - 60 + 0.1);
      expect(b.y + b.h).toBeLessThanOrEqual(h - 60 + 0.1);
    }
  });

  it('writes coordinates with at most one decimal', () => {
    const s = svg(DEMOS.find((d) => d.id === 'full')!.dsl, ALL_ON);
    const geometry = ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'd', 'transform', 'viewBox'];
    for (const el of s.root.querySelectorAll('*')) {
      for (const a of geometry) {
        expect(el.getAttribute(a) ?? '', `${el.tagName}[${a}]`).not.toMatch(/\.\d{2,}/);
      }
    }
  });

  it('renders a placeholder instead of a degenerate canvas for an empty model', () => {
    for (const src of ['', 'map "Nothing yet"', '# just a comment']) {
      const s = toDoc(render(parse(src).map, L0, 1));
      expect(s.size()).toEqual({ w: 640, h: 360 });
      expect(s.nodes()).toHaveLength(0);
      expect(s.texts().join(' ')).toContain('No contexts yet');
    }
  });
});

describe('determinism', () => {
  const dsl = DEMOS.find((d) => d.id === 'full')!.dsl;

  it('renders identical markup for identical input', () => {
    expect(render(model(dsl), L3, 1)).toBe(render(model(dsl), L3, 1));
  });

  it('re-layout (a new seed) moves unpinned contexts', () => {
    expect(render(model(dsl), L0, 1)).not.toBe(render(model(dsl), L0, 2));
  });

  it('a fully pinned map ignores the seed', () => {
    expect(render(model(PAIR), L0, 1)).toBe(render(model(PAIR), L0, 7));
  });
});

describe('context nodes', () => {
  it('draws one node per context, titled with its name', () => {
    const s = svg('context Sales\ncontext "Order Mgmt"\ncontext Billing', L0);
    expect(s.nodes()).toHaveLength(3);
    expect(s.nodes().map((n) => n.querySelector('text')!.textContent)).toEqual(['Sales', 'Order Mgmt', 'Billing']);
  });

  it('draws nodes after edges so boxes sit on top of lines', () => {
    const s = svg(`${PAIR}\nA -> B`, L0);
    const order = [...s.root.children].map((el) => el.getAttribute('class'));
    expect(order.lastIndexOf('rel')).toBeLessThan(order.indexOf('node'));
  });

  it('clips a name too long for the box and keeps the full name as a tooltip', () => {
    const long = 'Regulatory Compliance Reporting';
    const s = svg(`context "${long}"`, L0);
    const title = s.nodes()[0].querySelector('text')!;
    expect(title.textContent).toMatch(/…$/);
    expect(title.textContent!.length).toBeLessThanOrEqual(22);
    expect(title.getAttribute('data-tip')).toBe(long);
  });

  it('does not add a tooltip to a name that fits', () => {
    const s = svg('context Sales', L0);
    expect(s.node('Sales').querySelector('text')!.hasAttribute('data-tip')).toBe(false);
  });

  it('pinned contexts keep their relative offsets', () => {
    const s = svg('context A { at 100 100 }\ncontext B { at 400 250 }', L0);
    const a = s.box('A');
    const b = s.box('B');
    expect(b.x - a.x).toBeCloseTo(300, 0);
    expect(b.y - a.y).toBeCloseTo(150, 0);
  });
});

describe('classification layer', () => {
  const dsl = `
context Legal { subdomain core  cynefin complex }
context Library { subdomain generic }
context Bare
`;

  it('is hidden on L0: neutral accent, no chips', () => {
    const s = svg(dsl, L0);
    expect(s.all('chip')).toHaveLength(0);
    expect(s.node('Legal').querySelector('rect')!.getAttribute('stroke')).toBe('#334155');
  });

  it('shows subdomain + cynefin chips and tints the node by subdomain', () => {
    const s = svg(dsl, L1);
    expect(s.texts(s.node('Legal'))).toEqual(['Legal', 'Core', 'Complex']);
    expect(s.texts(s.node('Library'))).toEqual(['Library', 'Generic']);
    expect(s.node('Legal').querySelector('rect')!.getAttribute('stroke')).toBe('#7c3aed');
    expect(s.node('Library').querySelector('rect')!.getAttribute('stroke')).toBe('#64748b');
  });

  it('leaves an unclassified context neutral', () => {
    const s = svg(dsl, L1);
    expect(s.all('chip', s.node('Bare'))).toHaveLength(0);
    expect(s.node('Bare').querySelector('rect')!.getAttribute('stroke')).toBe('#334155');
  });
});

describe('questions layer', () => {
  const dsl = `
context Legal {
  question "What constraints do we operate under when licensing material abroad?"
  question "Short one?"
}`;

  it('is hidden on L0', () => {
    expect(svg(dsl, L0).texts()).toEqual(['Legal']);
  });

  it('word-wraps long questions and grows the box to fit them', () => {
    const closed = svg(dsl, L0);
    const open = svg(dsl, L1);
    const lines = open.texts(open.node('Legal')).filter((t) => t !== 'Legal' && t !== '?');
    expect(lines.length).toBeGreaterThan(2); // first question needed several lines
    expect(lines.every((l) => l.length <= 34)).toBe(true);
    expect(lines.join(' ')).toBe(
      'What constraints do we operate under when licensing material abroad? Short one?'
    );
    expect(open.box('Legal').h).toBeGreaterThan(closed.box('Legal').h);
  });

  it('marks each question with a single "?" bullet', () => {
    const s = svg(dsl, L1);
    expect(s.texts(s.node('Legal')).filter((t) => t === '?')).toHaveLength(2);
  });

  it('keeps all text inside the box', () => {
    const s = svg(dsl, L1);
    const b = s.box('Legal');
    for (const t of s.node('Legal').querySelectorAll('text')) {
      expect(attr(t, 'y')).toBeLessThan(b.y + b.h);
    }
  });
});

describe('relations layer', () => {
  it('draws a lone relation as a straight arrow between the box borders', () => {
    const s = svg(`${PAIR}\nA -> B`, L0);
    expect(s.relations()).toHaveLength(1);
    const line = s.relations()[0].querySelector('line')!;
    const a = s.box('A');
    const b = s.box('B');
    expect(attr(line, 'x1')).toBeCloseTo(a.x + a.w + 2, 1); // leaves A on its right edge (+2 gap)
    expect(attr(line, 'x2')).toBeCloseTo(b.x - 2, 1); // enters B on its left edge
    expect(attr(line, 'y1')).toBeCloseTo(attr(line, 'y2'), 1);
    expect(line.getAttribute('marker-end')).toBe('url(#arrow)');
  });

  it('labels the pattern and integration note, and marks U/D roles', () => {
    const s = svg(
      `${PAIR}\nA -> B { type customer-supplier  upstream OHS  downstream ACL  integration "REST" }`,
      L0
    );
    expect(s.texts(s.relations()[0])).toEqual(['customer-supplier  «REST»', 'U:OHS', 'D:ACL']);
  });

  it('falls back to bare U / D marks when no roles are given', () => {
    const s = svg(`${PAIR}\nA -> B`, L0);
    expect(s.texts(s.relations()[0])).toEqual(['U', 'D']);
  });

  it('puts the U mark near the upstream end and the D mark near the downstream end', () => {
    const s = svg(`${PAIR}\nB -> A`, L0); // upstream is B, on the right
    const x = (cls: string) => Number(/translate\(([-\d.]+)/.exec(s.all(cls)[0].getAttribute('transform')!)![1]);
    expect(x('role-u')).toBeGreaterThan(x('role-d'));
  });

  it('fans parallel relations out into separate curves', () => {
    const s = svg(`${PAIR}\nA -> B { type one }\nA -> B { type two }\nA -> B { type three }`, L0);
    const curves = s.relations().map((r) => r.querySelector('path, line')!);
    const controlY = curves.map((c) => (c.tagName === 'path' ? pathNumbers(c)[3] : attr(c, 'y1')));
    expect(new Set(controlY).size).toBe(3);
    // the middle one stays on the straight line between its siblings
    const [first, mid, last] = controlY;
    expect(Math.min(first, last)).toBeLessThan(mid);
    expect(Math.max(first, last)).toBeGreaterThan(mid);
  });

  it('separates A -> B from B -> A (they used to land on the same curve)', () => {
    const s = svg(`${PAIR}\nA -> B\nB -> A`, L0);
    const [ab, ba] = s.relations().map((r) => pathNumbers(r.querySelector('path')!));
    const lineY = ab[1];
    // control points sit on opposite sides of the straight A–B line
    expect(Math.sign(ab[3] - lineY)).toBe(-Math.sign(ba[3] - lineY));
    expect(ab[3]).not.toBeCloseTo(ba[3], 0);
  });

  it('staggers the labels of parallel relations so they do not stack', () => {
    const s = svg(`${PAIR}\nA -> B { type one }\nB -> A { type two }`, L0);
    const at = s.all('rel-label').map((g) => g.getAttribute('transform'));
    expect(new Set(at).size).toBe(2);
  });

  it('draws nothing for a relation whose endpoint does not exist', () => {
    const { map, errors } = parse('context A\nA -> Ghost');
    expect(errors).toHaveLength(1);
    expect(toDoc(render(map, L0, 1)).relations()).toHaveLength(0);
  });

  it('draws nothing for a self-relation', () => {
    const { map } = parse('context A\nA -> A');
    expect(toDoc(render(map, L0, 1)).relations()).toHaveLength(0);
  });

  it('is hidden on the Promise lens', () => {
    expect(svg(`${PAIR}\nA -> B { connascence name }`, L2).relations()).toHaveLength(0);
  });
});

describe('promise layer', () => {
  const dsl = `
context Orders {
  at 0 0
  promise + "an accepted order is valid and paid" to Warehouse
  promise - "label format" from Warehouse if "labels are v2"
  promise "uptime"
}
context Warehouse {
  at 600 0
  imposition "use our pallets" on Orders
}`;

  it('is hidden below L2', () => {
    expect(svg(dsl, L1).promises()).toHaveLength(0);
  });

  it('draws one dashed arrow per directed promise', () => {
    const s = svg(dsl, L2);
    expect(s.promises()).toHaveLength(4);
    const paths = s.promises().flatMap((p) => [...p.querySelectorAll('path')]);
    expect(paths).toHaveLength(3); // the undirected one has no arrow
    expect(paths.every((p) => p.getAttribute('stroke-dasharray') === '5 4')).toBe(true);
  });

  it('colours and marks give (+), use (−) and imposition differently', () => {
    const s = svg(dsl, L2);
    const look = s
      .promises()
      .map((p) => p.querySelector('path'))
      .filter((p) => p !== null)
      .map((p) => [p.getAttribute('stroke'), p.getAttribute('marker-end')]);
    expect(look).toEqual([
      ['#0d9488', 'url(#promise)'],
      ['#4f46e5', 'url(#promiseUse)'],
      ['#dc2626', 'url(#imposition)'],
    ]);
  });

  it('prefixes labels with the polarity sign and flags conditions with *', () => {
    const labels = svg(dsl, L2).texts().filter((t) => /^[(⊳]/.test(t));
    expect(labels).toEqual(['(+) an accepted order i…', '(−) label format *', '(+) uptime', '⊳ use our pallets']);
  });

  it('carries the untruncated body and condition in data-tip', () => {
    const s = svg(dsl, L2);
    const tips = s.all('has-tip').map((g) => g.getAttribute('data-tip'));
    expect(tips).toEqual([
      '(+) an accepted order is valid and paid',
      '(−) label format  (if labels are v2)',
    ]);
  });

  it('shows a promise to everyone as a tag floating above its promiser', () => {
    const s = svg(dsl, L2);
    const tag = s.promises()[2];
    expect(tag.querySelector('path')).toBeNull();
    const [, x, y] = /translate\(([-\d.]+),([-\d.]+)\)/.exec(tag.querySelector('g')!.getAttribute('transform')!)!;
    const box = s.box('Orders');
    expect(Number(x)).toBeCloseTo(box.x + box.w / 2, 1);
    expect(Number(y)).toBeLessThan(box.y);
  });

  it('curves even a lone promise, so it never reads as a structural relation', () => {
    const s = svg('context A { at 0 0  promise "x" to B }\ncontext B { at 600 0 }', L2);
    const [, y1, , cy] = pathNumbers(s.promises()[0].querySelector('path')!);
    expect(cy).not.toBeCloseTo(y1, 0);
  });

  it('does not draw a promise to an unknown context as a promise to everyone', () => {
    const { map, errors } = parse('context A { promise "x" to Ghost }');
    expect(errors).toHaveLength(1);
    expect(toDoc(render(map, L2, 1)).promises()).toHaveLength(0);
  });
});

describe('connascence layer', () => {
  const dsl = `
${PAIR}
context C { at 300 400 }
A -> B {
  type customer-supplier
  coupling 2
  connascence meaning distant 3
  connascence value distant 2
}
B -> C { connascence name local 1 }
A -> C { type conformist }
`;

  it('shows only boundaries that carry connascence, without DDD chrome', () => {
    const s = svg(dsl, L3);
    expect(s.relations()).toHaveLength(2);
    expect(s.all('role')).toHaveLength(0);
    expect(s.all('rel-label')).toHaveLength(0);
  });

  it('headlines the strongest kind, counts the rest, and shows the score', () => {
    const s = svg(dsl, L3);
    expect(s.texts(s.relations()[0])).toEqual(['Co⇢Value +1 84']);
    expect(s.texts(s.relations()[1])).toEqual(['Co·Name 8']);
  });

  it('encodes risk as colour, thickness and a matching arrowhead', () => {
    const s = svg(dsl, L3);
    const [high, low] = s.relations().map((r) => r.querySelector('line, path')!);
    expect(high.getAttribute('stroke')).toBe('#dc2626');
    expect(high.getAttribute('stroke-width')).toBe('5.8'); // 1.6 + 84% of 5
    expect(high.getAttribute('marker-end')).toBe('url(#arrow-high)');
    expect(low.getAttribute('stroke')).toBe('#16a34a');
    expect(low.getAttribute('stroke-width')).toBe('2.0');
    expect(low.getAttribute('marker-end')).toBe('url(#arrow-low)');
  });

  it('explains every kind on the badge tooltip, strongest first', () => {
    const tip = svg(dsl, L3).relations()[0].querySelector('[data-tip]')!.getAttribute('data-tip')!;
    expect(tip.split('\n')).toHaveLength(2);
    expect(tip).toMatch(/^84 — dynamic connascence of Value/);
  });

  it('prints weighted Ca · Ce · I in each node footer', () => {
    const s = svg(dsl, L3);
    const footer = (n: string) => s.all('coupling', s.node(n))[0].textContent;
    expect(footer('A')).toBe('Ca 3 · Ce 0 · I 0.00'); // coupling 2 + default 1
    expect(footer('B')).toBe('Ca 1 · Ce 2 · I 0.67');
    expect(footer('C')).toBe('Ca 0 · Ce 2 · I 1.00');
  });

  it('colours instability: stable green, balanced amber, unstable red', () => {
    const s = svg(dsl, L3);
    const colour = (n: string) => s.all('coupling', s.node(n))[0].querySelector('tspan')!.getAttribute('fill');
    expect([colour('A'), colour('B'), colour('C')]).toEqual(['#16a34a', '#d97706', '#dc2626']);
  });

  it('keeps plain styling for scored relations when the layer is off', () => {
    const line = svg(dsl, L0).relations()[0].querySelector('line, path')!;
    expect(line.getAttribute('stroke')).toBe('#94a3b8');
    expect(line.getAttribute('stroke-width')).toBe('1.6');
  });

  it('combines with the relations layer when both toggles are on', () => {
    const s = svg(dsl, ALL_ON);
    expect(s.relations()).toHaveLength(3); // unscored A -> C is back
    expect(s.texts(s.relations()[0])).toEqual(['customer-supplier', 'U', 'D', 'Co⇢Value +1 84']);
  });
});

describe('escaping of user-authored text', () => {
  const hostile = `
map "<script>alert(1)</script>"
context "<img src=x onerror=alert(1)>" {
  subdomain core
  question "a < b && c > d"
  promise "say hi & <b>wave</b> to absolutely everyone around" to Other if "x < 1"
}
context Other
"<img src=x onerror=alert(1)>" -> Other { type "<i>t</i>"  integration "a&b"  connascence name }
`;

  it('never turns DSL text into markup', () => {
    const { map } = parse(hostile);
    const s = toDoc(render(map, ALL_ON, 1));
    expect(s.root.querySelectorAll('script, img, b, i')).toHaveLength(0);
    expect(s.markup).not.toContain('<script>');
  });

  it('round-trips special characters through text and attributes', () => {
    const { map } = parse(hostile);
    const s = toDoc(render(map, ALL_ON, 1));
    expect(s.root.querySelector('title')!.textContent).toBe('<script>alert(1)</script>');
    expect(s.texts()).toContain('a < b && c > d');
    expect(s.texts()).toContain('<i>t</i>  «a&b»');
    const tips = s.all('has-tip').map((g) => g.getAttribute('data-tip'));
    expect(tips.some((t) => t?.includes('<b>wave</b>') && t.includes('(if x < 1)'))).toBe(true);
  });

  it('escapes double quotes in attributes (reachable via a hand-built model)', () => {
    // the DSL has no string escapes, so a quote can only arrive programmatically
    const body = 'a "quoted" body that is long enough to be clipped';
    const s = toDoc(
      render(
        {
          title: 't',
          contexts: [
            { name: 'A', questions: [], promises: [{ body, kind: 'promise', polarity: '+', to: 'B' }] },
            { name: 'B', questions: [], promises: [] },
          ],
          relations: [],
        },
        L2,
        1
      )
    );
    expect(s.all('has-tip')[0].getAttribute('data-tip')).toBe(`(+) ${body}`);
  });
});
