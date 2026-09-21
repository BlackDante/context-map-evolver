import type { ContextMap } from './model';

export interface NodeBox {
  name: string;
  x: number; // centre
  y: number;
  w: number;
  h: number;
}

export interface LaidOut {
  nodes: Map<string, NodeBox>;
  width: number;
  height: number;
}

/**
 * Deterministic force-directed layout (Fruchterman–Reingold style) seeded from
 * a hash of the node name, so the same model always lands the same way — no
 * jitter during a live demo. Contexts with explicit `at x y` are pinned: the
 * forces never move them. Note the final pass translates the whole map so its
 * bounding box starts at the padding — pinned coordinates are therefore
 * relative to each other, not absolute canvas positions.
 *
 * `sizes` gives each node's box dimensions (they grow as layers are revealed),
 * so re-running layout after toggling a layer keeps boxes from overlapping.
 *
 * A force simulation only ever relaxes the arrangement it started from — it
 * cannot untangle two edges that begin crossed. So several starting
 * arrangements are simulated and the tidiest result wins.
 */
export function layout(map: ContextMap, sizes: Map<string, { w: number; h: number }>, seed = 1): LaidOut {
  const free = map.contexts.filter((c) => c.x == null || c.y == null).length;
  // with nothing (or one thing) to place, every start gives the same picture
  const attempts = free > 1 ? ATTEMPTS : 1;
  let best: LaidOut | undefined;
  let bestScore = Infinity;
  for (let i = 0; i < attempts; i++) {
    const candidate = simulate(map, sizes, seed * 1000 + i);
    const score = untidiness(map, candidate);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best!;
}

/**
 * Lower is tidier. An edge running underneath an unrelated box is the worst
 * offence (the box hides it), then edges crossing each other; canvas area only
 * breaks ties, favouring the more compact of two equally clean layouts.
 */
function untidiness(map: ContextMap, lo: LaidOut): number {
  const seen = new Set<string>();
  const edges: [NodeBox, NodeBox][] = [];
  const connect = (a: string, b?: string) => {
    const A = lo.nodes.get(a);
    const B = b == null ? undefined : lo.nodes.get(b);
    if (!A || !B || A === B || seen.has(pairKey(a, B.name))) return;
    seen.add(pairKey(a, B.name));
    edges.push([A, B]);
  };
  for (const r of map.relations) connect(r.source, r.target);
  for (const c of map.contexts) for (const pr of c.promises) connect(c.name, pr.to);

  let crossings = 0;
  let hidden = 0;
  edges.forEach(([A, B], i) => {
    for (const [C, D] of edges.slice(i + 1)) {
      // edges sharing an endpoint meet there by design — that is not a crossing
      if (A === C || A === D || B === C || B === D) continue;
      if (segmentsCross(A, B, C, D)) crossings++;
    }
    for (const node of lo.nodes.values()) {
      if (node !== A && node !== B && segmentHitsBox(A, B, node)) hidden++;
    }
  });
  return hidden * 1e9 + crossings * 1e8 + lo.width * lo.height;
}

type XY = { x: number; y: number };

function segmentsCross(p1: XY, p2: XY, p3: XY, p4: XY): boolean {
  const side = (a: XY, b: XY, c: XY) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  return side(p1, p2, p3) !== side(p1, p2, p4) && side(p3, p4, p1) !== side(p3, p4, p2);
}

function segmentHitsBox(p1: XY, p2: XY, box: NodeBox): boolean {
  const l = box.x - box.w / 2;
  const r = box.x + box.w / 2;
  const t = box.y - box.h / 2;
  const b = box.y + box.h / 2;
  const corners: XY[] = [{ x: l, y: t }, { x: r, y: t }, { x: r, y: b }, { x: l, y: b }];
  return corners.some((c, i) => segmentsCross(p1, p2, c, corners[(i + 1) % 4]));
}

function simulate(map: ContextMap, sizes: Map<string, { w: number; h: number }>, seed: number): LaidOut {
  const nodes = new Map<string, NodeBox>();
  // nothing to place — and the bounding-box pass below would yield ±Infinity
  if (map.contexts.length === 0) return { nodes, width: 0, height: 0 };
  const n = map.contexts.length;
  // ideal-distance budget; kept modest so small maps stay compact on screen
  const area = 520;

  // Start on a circle. The first attempt keeps declaration order (authors tend
  // to declare contexts in a meaningful sequence); later attempts shuffle the
  // order by hash, which is what actually yields different edge topologies.
  const slot = new Map<string, number>();
  const shuffled = seed % 1000 === 0 ? map.contexts : [...map.contexts].sort((a, b) => hash(`${seed}:${a.name}`) - hash(`${seed}:${b.name}`));
  shuffled.forEach((c, i) => slot.set(c.name, i));

  map.contexts.forEach((c) => {
    const idx = slot.get(c.name)!;
    const sz = sizes.get(c.name) ?? { w: 200, h: 90 };
    let x: number;
    let y: number;
    if (c.x != null && c.y != null) {
      x = c.x;
      y = c.y;
    } else {
      // deterministic pseudo-random start on a circle
      const h = hash(`${seed}:${c.name}`); // seed FIRST: appended, it barely perturbs FNV's ordering
      const ang = (idx / n) * Math.PI * 2 + (h % 100) / 200;
      const r = 140 + (h % 70);
      x = 400 + Math.cos(ang) * r;
      y = 320 + Math.sin(ang) * r;
    }
    nodes.set(c.name, { name: c.name, x, y, w: sz.w, h: sz.h });
  });

  const pinned = new Set(map.contexts.filter((c) => c.x != null && c.y != null).map((c) => c.name));
  const k = Math.sqrt((area * area) / n) * 0.7; // ideal distance

  // Attraction follows ANY link, not just structural relations — otherwise a
  // context that only appears in a promise (e.g. a promise *to* it) has nothing
  // pulling it in and drifts off, blowing up the canvas. So include promise
  // edges too (weaker: they only need to anchor the node).
  //
  // One link per PAIR, however many edges it carries: if every parallel
  // relation pulled separately, the pairs with the most labels to fit would end
  // up with the least room.
  const links = new Map<string, { a: string; b: string; w: number; edges: number }>();
  const link = (a: string, b: string, w: number) => {
    if (a === b) return;
    const key = pairKey(a, b);
    const l = links.get(key);
    if (l) {
      l.w = Math.max(l.w, w);
      l.edges++;
    } else links.set(key, { a, b, w, edges: 1 });
  };
  for (const r of map.relations) link(r.source, r.target, 1);
  for (const c of map.contexts) {
    for (const pr of c.promises) {
      if (pr.to) link(c.name, pr.to, 0.4);
    }
  }

  const iterations = 320;
  for (let it = 0; it < iterations; it++) {
    const disp = new Map<string, { dx: number; dy: number }>();
    for (const node of nodes.values()) disp.set(node.name, { dx: 0, dy: 0 });

    // repulsion between every pair
    const arr = [...nodes.values()];
    for (let a = 0; a < arr.length; a++) {
      for (let b = a + 1; b < arr.length; b++) {
        const A = arr[a];
        const B = arr[b];
        let dx = A.x - B.x;
        let dy = A.y - B.y;
        let dist = Math.hypot(dx, dy) || 0.01;
        dx /= dist;
        dy /= dist;
        const minClear = clearance(A, B, dx, dy, links.get(pairKey(A.name, B.name))?.edges ?? 0);
        const force = (k * k) / dist + (dist < minClear ? (minClear - dist) * 8 : 0);
        disp.get(A.name)!.dx += dx * force;
        disp.get(A.name)!.dy += dy * force;
        disp.get(B.name)!.dx -= dx * force;
        disp.get(B.name)!.dy -= dy * force;
      }
    }

    // attraction along every link (relations full, promises weaker)
    for (const link of links.values()) {
      const A = nodes.get(link.a);
      const B = nodes.get(link.b);
      if (!A || !B) continue;
      let dx = A.x - B.x;
      let dy = A.y - B.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      dx /= dist;
      dy /= dist;
      // pull only on the distance BEYOND the clearance the pair needs. Pulling
      // on the full distance overpowers the clearance spring, and linked boxes
      // settle too close for their edge labels.
      const slack = Math.max(0, dist - clearance(A, B, dx, dy, link.edges));
      // the linear term keeps the spring stiff near the clearance, where the
      // quadratic one alone is too weak to hold against everyone's repulsion
      const force = ((slack * slack) / k + slack * 3) * link.w;
      disp.get(A.name)!.dx -= dx * force;
      disp.get(A.name)!.dy -= dy * force;
      disp.get(B.name)!.dx += dx * force;
      disp.get(B.name)!.dy += dy * force;
    }

    // weak gravity towards the centroid. Without it a context that has no links
    // (every new context, until its first relation is typed) feels only
    // repulsion and drifts off, stretching the canvas until the rest of the map
    // is unreadably small.
    let cx = 0;
    let cy = 0;
    for (const node of arr) {
      cx += node.x / arr.length;
      cy += node.y / arr.length;
    }
    for (const node of arr) {
      disp.get(node.name)!.dx += (cx - node.x) * GRAVITY;
      disp.get(node.name)!.dy += (cy - node.y) * GRAVITY;
    }

    const temp = 30 * (1 - it / iterations);
    for (const node of nodes.values()) {
      if (pinned.has(node.name)) continue;
      const d = disp.get(node.name)!;
      const len = Math.hypot(d.dx, d.dy) || 0.01;
      node.x += (d.dx / len) * Math.min(len, temp);
      node.y += (d.dy / len) * Math.min(len, temp);
    }
  }

  // normalise into positive coordinate space with padding
  const pad = 60;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes.values()) {
    minX = Math.min(minX, node.x - node.w / 2);
    minY = Math.min(minY, node.y - node.h / 2);
    maxX = Math.max(maxX, node.x + node.w / 2);
    maxY = Math.max(maxY, node.y + node.h / 2);
  }
  for (const node of nodes.values()) {
    node.x = node.x - minX + pad;
    node.y = node.y - minY + pad;
  }
  return {
    nodes,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

// clear space between box borders: side by side / stacked / extra for parallel edges
const GAP_X = 200;
const GAP_Y = 110;
const GAP_PARALLEL = 120;
/** Starting arrangements to try; the tidiest result is kept. */
const ATTEMPTS = 8;
/** Pull towards the centroid per px of distance; balances repulsion at ~k/√GRAVITY. */
const GRAVITY = 0.5;

/**
 * Minimum centre-to-centre distance for two boxes lying along the unit
 * direction (ux, uy): both boxes' reach plus a clear gap between their borders
 * (centre distance alone lets tall boxes stacked vertically touch). Edge labels
 * are horizontal text, so side-by-side boxes need a wider gap than stacked
 * ones; fanned-out parallel edges need room for their staggered labels too.
 */
function clearance(A: NodeBox, B: NodeBox, ux: number, uy: number, edges: number): number {
  const gap = Math.abs(ux) * GAP_X + Math.abs(uy) * GAP_Y + (edges > 1 ? GAP_PARALLEL : 0);
  return reach(A, ux, uy) + reach(B, ux, uy) + gap;
}

/** Distance from a box's centre to its border along the unit direction (ux, uy). */
function reach(box: NodeBox, ux: number, uy: number): number {
  return 1 / Math.max(Math.abs(ux) / (box.w / 2), Math.abs(uy) / (box.h / 2), 1e-9);
}

function pairKey(a: string, b: string): string {
  return JSON.stringify([a, b].sort());
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
