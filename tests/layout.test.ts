import { describe, expect, it } from 'vitest';
import { layout } from '../src/layout';
import { DEMOS } from '../src/demos';
import { borderPoint } from '../src/geometry';
import { model } from './helpers';

const sizesFor = (names: string[], h = 60) => new Map(names.map((n) => [n, { w: 220, h }]));

function overlap(a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}

/** Clear space between two boxes, measured along the line joining their centres. */
function gap(lo: ReturnType<typeof layout>, a: string, b: string): number {
  const A = lo.nodes.get(a)!;
  const B = lo.nodes.get(b)!;
  const p = borderPoint(A, B.x, B.y);
  const q = borderPoint(B, A.x, A.y);
  return Math.hypot(p.x - q.x, p.y - q.y);
}

describe('layout', () => {
  it('returns an empty, finite result for a map without contexts', () => {
    const lo = layout({ title: '', contexts: [], relations: [] }, new Map());
    expect(lo.nodes.size).toBe(0);
    expect(lo).toMatchObject({ width: 0, height: 0 });
  });

  it('places a single context at the padding offset', () => {
    const lo = layout(model('context Solo'), sizesFor(['Solo']));
    expect(lo.nodes.get('Solo')).toMatchObject({ x: 60 + 110, y: 60 + 30 });
    expect(lo).toMatchObject({ width: 220 + 120, height: 60 + 120 });
  });

  it('is deterministic for a given seed and different across seeds', () => {
    const map = model(DEMOS.find((d) => d.id === 'full')!.dsl);
    const sizes = sizesFor(map.contexts.map((c) => c.name));
    const pos = (seed: number) => [...layout(map, sizes, seed).nodes.values()].map((n) => [n.x, n.y]);
    expect(pos(1)).toEqual(pos(1));
    expect(pos(1)).not.toEqual(pos(2));
  });

  it.each(DEMOS.map((d) => [d.name, d.dsl] as const))('%s: no two boxes overlap', (_name, dsl) => {
    const map = model(dsl);
    const lo = layout(map, sizesFor(map.contexts.map((c) => c.name), 140));
    const boxes = [...lo.nodes.values()];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlap(boxes[i], boxes[j]), `${boxes[i].name} overlaps ${boxes[j].name}`).toBe(false);
      }
    }
  });

  it('never moves pinned contexts relative to each other', () => {
    const map = model('context A { at 0 0 }\ncontext B { at 500 300 }\ncontext C\nA -> C\nB -> C');
    const lo = layout(map, sizesFor(['A', 'B', 'C']));
    const a = lo.nodes.get('A')!;
    const b = lo.nodes.get('B')!;
    expect(b.x - a.x).toBeCloseTo(500);
    expect(b.y - a.y).toBeCloseTo(300);
  });

  it('pulls related contexts closer than unrelated ones', () => {
    const map = model('context A\ncontext B\ncontext C\ncontext D\nA -> B');
    const lo = layout(map, sizesFor(['A', 'B', 'C', 'D']));
    expect(gap(lo, 'A', 'B')).toBeLessThan(gap(lo, 'A', 'C'));
    expect(gap(lo, 'A', 'B')).toBeLessThan(gap(lo, 'A', 'D'));
    expect(gap(lo, 'A', 'B')).toBeLessThan(gap(lo, 'C', 'D'));
  });

  it('keeps unlinked contexts nearby instead of letting them drift off', () => {
    const names = ['A', 'B', 'Island', 'Atoll'];
    const lo = layout(model('context A\ncontext B\ncontext Island\ncontext Atoll\nA -> B'), sizesFor(names));
    expect(lo.width).toBeLessThan(1400);
    expect(lo.height).toBeLessThan(1400);
  });

  it('lays out a map with no links at all compactly', () => {
    const names = ['A', 'B', 'C', 'D', 'E'];
    const lo = layout(model(names.map((n) => `context ${n}`).join('\n')), sizesFor(names));
    expect(Math.max(lo.width, lo.height)).toBeLessThan(1400);
  });

  it('anchors a context that is only reachable through a promise', () => {
    const linked = model('context A { promise "x" to B }\ncontext B\ncontext C\ncontext D');
    const lo = layout(linked, sizesFor(['A', 'B', 'C', 'D']));
    expect(gap(lo, 'A', 'B')).toBeLessThan(gap(lo, 'C', 'D'));
  });

  it('fits the canvas to the bounding box plus padding on every side', () => {
    const map = model(DEMOS.find((d) => d.id === 'classic')!.dsl);
    const lo = layout(map, sizesFor(map.contexts.map((c) => c.name)));
    const boxes = [...lo.nodes.values()];
    expect(Math.min(...boxes.map((b) => b.x - b.w / 2))).toBeCloseTo(60);
    expect(Math.min(...boxes.map((b) => b.y - b.h / 2))).toBeCloseTo(60);
    expect(Math.max(...boxes.map((b) => b.x + b.w / 2))).toBeCloseTo(lo.width - 60);
    expect(Math.max(...boxes.map((b) => b.y + b.h / 2))).toBeCloseTo(lo.height - 60);
  });

  it('falls back to a default size for a context missing from the size table', () => {
    const lo = layout(model('context A'), new Map());
    expect(lo.nodes.get('A')).toMatchObject({ w: 200, h: 90 });
  });

  describe('tidiness', () => {
    type P = { x: number; y: number };
    const side = (a: P, b: P, c: P) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    const cross = (a: P, b: P, c: P, d: P) => side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b);

    function crossings(dsl: string, seed = 1): number {
      const map = model(dsl);
      const lo = layout(map, sizesFor(map.contexts.map((c) => c.name)), seed);
      const at = (n: string) => lo.nodes.get(n)!;
      let count = 0;
      map.relations.forEach((r, i) => {
        for (const q of map.relations.slice(i + 1)) {
          if ([q.source, q.target].some((n) => n === r.source || n === r.target)) continue;
          if (cross(at(r.source), at(r.target), at(q.source), at(q.target))) count++;
        }
      });
      return count;
    }

    it('untangles a tree whose declaration order starts it off crossed', () => {
      // on the starting circle Sales–Billing and Shipping–Returns are chords that cross
      const dsl = 'context Sales\ncontext Shipping\ncontext Billing\ncontext Returns\nSales -> Shipping\nSales -> Billing\nShipping -> Returns';
      for (const seed of [1, 2, 3, 4]) expect(crossings(dsl, seed), `seed ${seed}`).toBe(0);
    });

    it('draws a ring without crossings', () => {
      const names = ['A', 'D', 'B', 'E', 'C', 'F']; // declared out of ring order
      const ring = ['A', 'B', 'C', 'D', 'E', 'F'];
      const dsl =
        names.map((n) => `context ${n}`).join('\n') +
        '\n' +
        ring.map((n, i) => `${n} -> ${ring[(i + 1) % ring.length]}`).join('\n');
      expect(crossings(dsl)).toBe(0);
    });

    it('does not blow up on a larger map', () => {
      const names = Array.from({ length: 24 }, (_, i) => `C${i}`);
      const dsl =
        names.map((n) => `context ${n}`).join('\n') +
        '\n' +
        names.slice(1).map((n, i) => `${names[Math.floor(i / 2)]} -> ${n}`).join('\n');
      const map = model(dsl);
      const started = performance.now();
      layout(map, sizesFor(names));
      const elapsed = performance.now() - started;
      // A guard against accidental exponential work (layout runs on every
      // keystroke), NOT a benchmark: shared CI runners are several times slower
      // than a laptop, so the budget is deliberately loose (~190 ms on an M-series Mac).
      expect(elapsed).toBeLessThan(5000);
    });
  });

  describe('room for edge labels', () => {
    it('keeps a clear gap between the borders of related boxes, however tall they are', () => {
      const map = model(DEMOS.find((d) => d.id === 'full')!.dsl);
      for (const h of [56, 120, 200]) {
        const lo = layout(map, sizesFor(map.contexts.map((c) => c.name), h));
        for (const r of map.relations) {
          expect(gap(lo, r.source, r.target), `${r.source} -> ${r.target} at box height ${h}`).toBeGreaterThan(100);
        }
      }
    });

    it('gives a pair with parallel relations MORE room, not less', () => {
      const names = ['A', 'B', 'C'];
      const single = layout(model('context A\ncontext B\ncontext C\nA -> B\nB -> C'), sizesFor(names));
      const double = layout(model('context A\ncontext B\ncontext C\nA -> B\nA -> B\nB -> C'), sizesFor(names));
      expect(gap(double, 'A', 'B')).toBeGreaterThan(gap(single, 'A', 'B') + 40);
    });

    it('does not let related boxes drift far apart either', () => {
      const lo = layout(model('context A\ncontext B\nA -> B'), sizesFor(['A', 'B']));
      expect(gap(lo, 'A', 'B')).toBeLessThan(260);
    });
  });
});
