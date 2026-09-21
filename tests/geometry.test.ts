import { describe, expect, it } from 'vitest';
import { borderPoint, clip, controlPoint, estW, fanOut, num, quadPoint, wrap } from '../src/geometry';

describe('borderPoint', () => {
  const box = { x: 100, y: 100, w: 200, h: 100 }; // spans x 0..200, y 50..150

  it('exits through the side facing the target, 2px outside the box', () => {
    const exit = (tx: number, ty: number) => {
      const p = borderPoint(box, tx, ty);
      return [Math.round(p.x * 1e6) / 1e6, Math.round(p.y * 1e6) / 1e6];
    };
    expect(exit(1000, 100)).toEqual([202, 100]);
    expect(exit(-1000, 100)).toEqual([-2, 100]);
    expect(exit(100, 1000)).toEqual([100, 152]);
    expect(exit(100, -1000)).toEqual([100, 48]);
  });

  it('exits through the corner on the exact diagonal', () => {
    const p = borderPoint(box, 100 + 102, 100 + 52);
    expect(p.x).toBeCloseTo(202);
    expect(p.y).toBeCloseTo(152);
  });

  it('stays on the ray from the centre to the target', () => {
    const p = borderPoint(box, 400, 250); // direction (300, 150) → slope 0.5
    expect((p.y - box.y) / (p.x - box.x)).toBeCloseTo(0.5);
  });

  it('returns the centre when the target IS the centre (no direction to pick)', () => {
    expect(borderPoint(box, 100, 100)).toEqual({ x: 100, y: 100 });
  });
});

describe('quadPoint', () => {
  const p1 = { x: 0, y: 0 };
  const c = { x: 50, y: 100 };
  const p2 = { x: 100, y: 0 };

  it('starts at p1 and ends at p2', () => {
    expect(quadPoint(p1, c, p2, 0)).toEqual(p1);
    expect(quadPoint(p1, c, p2, 1)).toEqual(p2);
  });

  it('bows halfway towards the control point at t = 0.5', () => {
    expect(quadPoint(p1, c, p2, 0.5)).toEqual({ x: 50, y: 50 });
  });

  it('degenerates to a straight line when the control point is the midpoint', () => {
    expect(quadPoint(p1, { x: 50, y: 0 }, p2, 0.25)).toEqual({ x: 25, y: 0 });
  });
});

describe('controlPoint', () => {
  it('is the midpoint for a zero offset', () => {
    expect(controlPoint({ x: 0, y: 0 }, { x: 100, y: 40 }, 0)).toEqual({ x: 50, y: 20 });
  });

  it('moves perpendicular to the edge by the offset', () => {
    expect(controlPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 30)).toEqual({ x: 50, y: 30 });
    const c = controlPoint({ x: 0, y: 0 }, { x: 0, y: 100 }, 30);
    expect(c.x).toBeCloseTo(-30);
    expect(c.y).toBeCloseTo(50);
  });

  it('flips sides when the edge direction flips — the reason fanOut mirrors offsets', () => {
    const a = controlPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 30);
    const b = controlPoint({ x: 100, y: 0 }, { x: 0, y: 0 }, 30);
    expect(a.y).toBe(-b.y);
  });

  it('survives coincident endpoints', () => {
    expect(controlPoint({ x: 5, y: 5 }, { x: 5, y: 5 }, 30)).toEqual({ x: 5, y: 5 });
  });
});

describe('fanOut', () => {
  it('leaves lone edges straight with a centred label', () => {
    expect(fanOut([{ a: 'A', b: 'B' }, { a: 'B', b: 'C' }], 100)).toEqual([
      { offset: 0, labelT: 0.5 },
      { offset: 0, labelT: 0.5 },
    ]);
  });

  it('spreads same-direction siblings symmetrically around the straight line', () => {
    const out = fanOut([{ a: 'A', b: 'B' }, { a: 'A', b: 'B' }, { a: 'A', b: 'B' }], 100);
    expect(out.map((o) => o.offset)).toEqual([-100, 0, 100]);
    expect(out.map((o) => o.labelT)).toEqual([0.3, 0.5, 0.7]);
  });

  it('mirrors opposite-direction edges so they separate in physical space', () => {
    const [ab, ba] = fanOut([{ a: 'A', b: 'B' }, { a: 'B', b: 'A' }], 100);
    // perpendiculars of A→B and B→A point opposite ways, so physically opposite
    // sides need offsets of the SAME sign
    expect(Math.sign(ab.offset)).toBe(Math.sign(ba.offset));
    expect(ab.offset).not.toBe(0);
    // and labels measured from opposite ends land at different physical spots
    expect(ab.labelT).not.toBeCloseTo(1 - ba.labelT);
  });

  it('groups by unordered pair regardless of which direction comes first', () => {
    const forward = fanOut([{ a: 'A', b: 'B' }, { a: 'B', b: 'A' }], 100);
    const backward = fanOut([{ a: 'B', b: 'A' }, { a: 'A', b: 'B' }], 100);
    expect(forward.every((o) => o.offset !== 0)).toBe(true);
    expect(backward.every((o) => o.offset !== 0)).toBe(true);
  });

  it('does not confuse pairs whose names share words', () => {
    // "A B"+"C" and "A"+"B C" would collide under a naive space-joined key
    const out = fanOut([{ a: 'A B', b: 'C' }, { a: 'A', b: 'B C' }], 100);
    expect(out.map((o) => o.offset)).toEqual([0, 0]);
  });

  it('stacks "to everyone" edges per source, separately from directed ones', () => {
    const out = fanOut([{ a: 'A' }, { a: 'A' }, { a: 'A', b: 'B' }, { a: 'B' }], 20);
    expect(out.map((o) => o.offset)).toEqual([-10, 10, 0, 0]);
  });

  it('handles an empty list', () => {
    expect(fanOut([], 100)).toEqual([]);
  });
});

describe('text fitting', () => {
  it('clip leaves short text alone and ends cut text with an ellipsis', () => {
    expect(clip('short', 10)).toBe('short');
    expect(clip('exactly10!', 10)).toBe('exactly10!');
    expect(clip('this is too long', 10)).toBe('this is t…');
    expect(clip('this is too long', 10)).toHaveLength(10);
  });

  it('clip does not leave a space dangling before the ellipsis', () => {
    expect(clip('hello world', 7)).toBe('hello…');
  });

  it('wrap breaks on word boundaries within the limit', () => {
    expect(wrap('the quick brown fox jumps', 10)).toEqual(['the quick', 'brown fox', 'jumps']);
  });

  it('wrap lets an over-long word overflow rather than splitting it', () => {
    expect(wrap('a supercalifragilistic b', 8)).toEqual(['a', 'supercalifragilistic', 'b']);
  });

  it('wrap ignores repeated and surrounding whitespace', () => {
    expect(wrap('  a   b  ', 10)).toEqual(['a b']);
    expect(wrap('', 10)).toEqual([]);
  });

  it('estW grows with length but never drops below the minimum pill width', () => {
    expect(estW('U')).toBe(20);
    expect(estW('x'.repeat(10))).toBe(63);
    expect(estW('x'.repeat(10), 5)).toBe(50);
  });
});

describe('num', () => {
  it('rounds to one decimal and drops trailing zeros', () => {
    expect(num(12.3456)).toBe('12.3');
    expect(num(12.96)).toBe('13');
    expect(num(7)).toBe('7');
  });

  it('never prints negative zero', () => {
    expect(num(-0)).toBe('0');
    expect(num(-0.04)).toBe('0');
  });

  it('keeps the sign of real negatives', () => {
    expect(num(-12.34)).toBe('-12.3');
  });
});
