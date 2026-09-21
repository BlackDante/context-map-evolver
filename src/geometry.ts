// Pure geometry + text-fitting helpers for the SVG renderer. No DOM, no model —
// just numbers and strings in, numbers and strings out, so they are trivially
// unit-testable.

export interface Point {
  x: number;
  y: number;
}

/** An axis-aligned box described by its centre and size. */
export interface Box extends Point {
  w: number;
  h: number;
}

/** Where an edge is drawn relative to the straight line between two nodes. */
export interface EdgePlacement {
  /** Perpendicular offset of the curve's control point (0 = straight line). */
  offset: number;
  /** Parameter t∈[0,1] along the edge where its label sits. */
  labelT: number;
}

/**
 * The point where a ray from the box centre towards (tx, ty) leaves the box
 * (plus a 2px breathing gap), so edges start on the border rather than the
 * centre.
 */
export function borderPoint(box: Box, tx: number, ty: number): Point {
  const dx = tx - box.x;
  const dy = ty - box.y;
  if (dx === 0 && dy === 0) return { x: box.x, y: box.y };
  const hw = box.w / 2 + 2;
  const hh = box.h / 2 + 2;
  const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  return { x: box.x + dx * scale, y: box.y + dy * scale };
}

/** Point on a quadratic Bézier (p1, control, p2) at parameter t∈[0,1]. */
export function quadPoint(p1: Point, c: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p1.x + 2 * u * t * c.x + t * t * p2.x,
    y: u * u * p1.y + 2 * u * t * c.y + t * t * p2.y,
  };
}

/** Control point of the curve p1→p2 bowed sideways by `offset`. */
export function controlPoint(p1: Point, p2: Point, offset: number): Point {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  // unit perpendicular to the edge direction
  return {
    x: (p1.x + p2.x) / 2 + (-dy / len) * offset,
    y: (p1.y + p2.y) / 2 + (dx / len) * offset,
  };
}

/**
 * Spread edges that share an unordered pair of endpoints so their curves and
 * labels don't overlap: a symmetric perpendicular offset fans the curves apart,
 * and an along-edge label stagger keeps sibling labels from stacking. A lone
 * edge stays straight (offset 0, label in the middle).
 *
 * Offsets are perpendicular to each edge's OWN direction, so an edge running
 * against the pair's canonical direction gets a mirrored offset & labelT —
 * otherwise `A -> B` and `B -> A` would bow to the same physical side and land
 * exactly on top of each other.
 *
 * An edge without `b` is "to everyone"; those group per source and stack.
 */
export function fanOut(pairs: { a: string; b?: string }[], spacing: number): EdgePlacement[] {
  const groups = new Map<string, number[]>();
  pairs.forEach((p, i) => {
    // JSON keeps the key unambiguous even when names contain spaces
    const key = p.b != null ? JSON.stringify([p.a, p.b].sort()) : JSON.stringify([p.a]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  });
  const out: EdgePlacement[] = pairs.map(() => ({ offset: 0, labelT: 0.5 }));
  for (const idxs of groups.values()) {
    const n = idxs.length;
    if (n < 2) continue;
    const p0 = pairs[idxs[0]];
    const first = p0.b != null && p0.b < p0.a ? p0.b : p0.a;
    idxs.forEach((idx, k) => {
      const s = pairs[idx].a === first ? 1 : -1; // +1 if edge runs canonical direction
      const c = k - (n - 1) / 2; // centred index around 0 → fan curves apart
      const f = 0.3 + 0.4 * (k / (n - 1)); // even spread across the middle band
      out[idx] = { offset: s * c * spacing, labelT: s > 0 ? f : 1 - f };
    });
  }
  return out;
}

/** Truncate to at most `max` characters, ending in an ellipsis when cut. */
export function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

/** Greedy word-wrap to lines of at most `max` characters (long words overflow). */
export function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Rough rendered width of a label. There is no DOM to measure against (the
 * renderer is a pure string builder), so this is a per-character estimate.
 */
export function estW(text: string, perChar = 6.3): number {
  return Math.max(20, text.length * perChar);
}

/** Format a coordinate: at most one decimal, no trailing zero, never `-0`. */
export function num(n: number): string {
  const r = Math.round(n * 10) / 10;
  return String(r === 0 ? 0 : r);
}
