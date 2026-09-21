import type { ContextMap, CouplingMetric, Relation } from './model';
import { CONNASCENCE_META, CYNEFIN_META, SUBDOMAIN_META } from './model';
import { layout, type NodeBox } from './layout';
import { couplingMetrics, promiseEdges, scoreRelation, type PromiseEdge } from './analysis';
import { borderPoint, clip, controlPoint, estW, fanOut, num, quadPoint, wrap, type EdgePlacement } from './geometry';
import { esc, escAttr } from './escape';

export interface Layers {
  relations: boolean; // structural DDD relation arrows
  classification: boolean; // subdomain + cynefin chips + accent colour
  questions: boolean; // key-questions list inside nodes
  promise: boolean; // promise / imposition overlay
  connascence: boolean; // connascence scoring on relations
}

const BOX_W = 220;
/** Longest context name that fits the title band at 15px bold. */
const TITLE_MAX = 22;
/** Perpendicular spacing between parallel relations / promises on one pair. */
const RELATION_SPACING = 120;
const PROMISE_SPACING = 64;

const FONT = 'Inter, system-ui, sans-serif';
const NEUTRAL_EDGE = '#94a3b8';
const RISK_COLOR = { low: '#16a34a', medium: '#d97706', high: '#dc2626' } as const;

/**
 * Render the map as a standalone SVG document string. Pure: same model, layers
 * and seed always produce the same markup, and nothing here touches the DOM —
 * so the output can be injected into the page, downloaded, or asserted on.
 */
export function render(map: ContextMap, layers: Layers, seed: number): string {
  if (map.contexts.length === 0) return renderEmpty();

  // 1. size every node according to what the active layers show
  const sizes = new Map<string, { w: number; h: number }>();
  const wrapped = new Map<string, string[][]>();
  for (const c of map.contexts) {
    let h = 40; // title band
    if (layers.classification) h += 22; // classification row
    if (layers.questions && c.questions.length) {
      const qlines: string[][] = c.questions.map((q) => wrap(q, 34));
      wrapped.set(c.name, qlines);
      const totalQLines = qlines.reduce((n, l) => n + l.length, 0);
      h += 8 + totalQLines * 15 + c.questions.length * 4;
    }
    if (layers.connascence) h += 18; // afferent/efferent coupling footer
    sizes.set(c.name, { w: BOX_W, h: Math.max(h, 56) });
  }

  const metrics = new Map(couplingMetrics(map).map((m) => [m.context, m]));
  const lo = layout(map, sizes, seed);
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(lo.width)} ${num(lo.height)}" ` +
      `width="${num(lo.width)}" height="${num(lo.height)}" font-family="${FONT}">`
  );
  parts.push(`<title>${esc(map.title)}</title>`);
  parts.push(defs());
  parts.push(`<rect width="${num(lo.width)}" height="${num(lo.height)}" fill="#fbfbfd"/>`);

  // 2. edges between contexts. On L0/L1 these are the structural DDD relations.
  //    On the Coupling lens (L3) `relations` is off and we draw only the
  //    connascence connectors (boundaries that carry connascence). On the
  //    Promise lens (L2) both are off, so no edges here at all.
  if (layers.relations || layers.connascence) {
    const offsets = fanOut(map.relations.map((r) => ({ a: r.source, b: r.target })), RELATION_SPACING);
    map.relations.forEach((r, i) => {
      const A = lo.nodes.get(r.source);
      const B = lo.nodes.get(r.target);
      // unknown endpoints and self-relations are reported by the parser; there
      // is nothing meaningful to draw for them
      if (!A || !B || A === B) return;
      // connascence-only lens: skip boundaries with nothing to score
      if (!layers.relations && r.connascence.length === 0) return;
      parts.push(renderRelation(r, A, B, layers, offsets[i]));
    });
  }

  // 3. promise overlay (L2) — fan out promises that share a pair (the hub
  //    context often has several), so curves and labels don't pile up.
  if (layers.promise) {
    const pEdges = promiseEdges(map);
    const pOff = fanOut(pEdges.map((p) => ({ a: p.from, b: p.to })), PROMISE_SPACING);
    pEdges.forEach((pe, i) => {
      const A = lo.nodes.get(pe.from);
      if (!A) return;
      const B = pe.to != null ? lo.nodes.get(pe.to) : undefined;
      // a promise to an unknown (or the promiser's own) context is a parser
      // error — don't let it masquerade as a promise "to everyone"
      if (pe.to != null && (!B || B === A)) return;
      parts.push(renderPromise(pe, A, B, pOff[i]));
    });
  }

  // 4. nodes on top
  for (const c of map.contexts) {
    const box = lo.nodes.get(c.name)!;
    parts.push(renderNode(c, box, layers, wrapped.get(c.name) ?? [], metrics.get(c.name)));
  }

  parts.push('</svg>');
  return parts.join('\n');
}

// --- relations --------------------------------------------------------------

function renderRelation(r: Relation, A: NodeBox, B: NodeBox, layers: Layers, edge: EdgePlacement): string {
  const p1 = borderPoint(A, B.x, B.y);
  const p2 = borderPoint(B, A.x, A.y);
  // perpendicular offset lets parallel edges between the same pair fan out
  const ctrl = controlPoint(p1, p2, edge.offset);
  // anchor = label point on the (possibly curved) edge; staggered along the
  // edge for parallel siblings so their labels/badges don't sit on top of each other
  const anchor = quadPoint(p1, ctrl, p2, edge.labelT);

  let stroke = NEUTRAL_EDGE;
  let marker = 'arrow';
  let width = 1.6;
  let badge = '';

  if (layers.connascence && r.connascence.length) {
    const rs = scoreRelation(r)!;
    stroke = RISK_COLOR[rs.band];
    marker = `arrow-${rs.band}`; // arrowhead matches the risk colour of its line
    width = 1.6 + (rs.score / 100) * 5;
    const top = rs.kinds[0].con;
    const more = rs.kinds.length > 1 ? ` +${rs.kinds.length - 1}` : '';
    const loc = top.locality === 'distant' ? '⇢' : '·';
    const text = `Co${loc}${CONNASCENCE_META[top.kind].label}${more} ${rs.score}`;
    const tip = rs.kinds.map((k) => `${k.score} — ${k.reason}`).join('\n');
    badge = pill(anchor.x, anchor.y + 16, text, { fill: stroke, h: 18, fontSize: 9.5, pad: 14, tip });
  }

  const line =
    edge.offset === 0
      ? `<line x1="${num(p1.x)}" y1="${num(p1.y)}" x2="${num(p2.x)}" y2="${num(p2.y)}" stroke="${stroke}" ` +
        `stroke-width="${width.toFixed(1)}" marker-end="url(#${marker})"/>`
      : `<path d="M ${num(p1.x)} ${num(p1.y)} Q ${num(ctrl.x)} ${num(ctrl.y)} ${num(p2.x)} ${num(p2.y)}" fill="none" ` +
        `stroke="${stroke}" stroke-width="${width.toFixed(1)}" marker-end="url(#${marker})"/>`;

  // structural DDD chrome (pattern label, integration note, U/D roles) only on
  // the structure/strategic lenses — hidden on the pure Coupling lens.
  let chrome = '';
  if (layers.relations) {
    const labelBits: string[] = [];
    if (r.type) labelBits.push(r.type);
    if (r.integration) labelBits.push(`«${r.integration}»`);
    if (labelBits.length) {
      const text = labelBits.join('  ');
      const w = estW(text);
      chrome +=
        `<g class="rel-label" transform="translate(${num(anchor.x)},${num(anchor.y - 6)})">` +
        `<rect x="${num(-w / 2)}" y="-11" width="${num(w)}" height="16" rx="3" fill="#fff" stroke="#e2e8f0"/>` +
        `<text x="0" y="1" text-anchor="middle" font-size="10" fill="#475569">${esc(text)}</text></g>`;
    }
    const uRole = r.upstreamRole ? `U:${r.upstreamRole}` : 'U';
    const dRole = r.downstreamRole ? `D:${r.downstreamRole}` : 'D';
    const u = quadPoint(p1, ctrl, p2, 0.16);
    const d = quadPoint(p1, ctrl, p2, 0.84);
    chrome += pill(u.x, u.y, uRole, { fill: '#0f766e', h: 15, fontSize: 9, pad: 6, cls: 'role role-u' });
    chrome += pill(d.x, d.y, dRole, { fill: '#9333ea', h: 15, fontSize: 9, pad: 6, cls: 'role role-d' });
  }

  return `<g class="rel">${line}${chrome}${badge}</g>`;
}

/** A filled, fully-rounded label centred on (x, y) with white bold text. */
function pill(
  x: number,
  y: number,
  text: string,
  o: { fill: string; h: number; fontSize: number; pad: number; cls?: string; tip?: string }
): string {
  const w = estW(text) + o.pad;
  const cls = [o.cls, o.tip ? 'has-tip' : ''].filter(Boolean).join(' ');
  return (
    `<g${cls ? ` class="${cls}"` : ''}${o.tip ? ` data-tip="${escAttr(o.tip)}"` : ''} transform="translate(${num(x)},${num(y)})">` +
    `<rect x="${num(-w / 2)}" y="${num(-o.h / 2)}" width="${num(w)}" height="${o.h}" rx="${num(o.h / 2)}" fill="${o.fill}"/>` +
    `<text x="0" y="3" text-anchor="middle" font-size="${o.fontSize}" fill="#fff" font-weight="600" pointer-events="none">` +
    `${esc(text)}</text></g>`
  );
}

// --- promise overlay --------------------------------------------------------

function renderPromise(pe: PromiseEdge, A: NodeBox, B: NodeBox | undefined, edge: EdgePlacement): string {
  // (+) give = teal, (-) use = indigo, imposition = red
  const isImp = pe.kind === 'imposition';
  const color = isImp ? '#dc2626' : pe.polarity === '-' ? '#4f46e5' : '#0d9488';
  const marker = isImp ? 'imposition' : pe.polarity === '-' ? 'promiseUse' : 'promise';
  const sign = isImp ? '⊳' : pe.polarity === '-' ? '(−)' : '(+)';
  // keep the on-map label compact; the full body + condition show on hover and
  // in the panel. A trailing asterisk marks a conditional promise.
  const text = `${sign} ${clip(pe.body, 20)}${pe.condition ? ' *' : ''}`;
  const full = `${sign} ${pe.body}${pe.condition ? `  (if ${pe.condition})` : ''}`;

  if (!B) {
    // promised to everyone — floating tag above the node (stacked if several)
    return `<g class="promise">${tag(A.x, A.y - A.h / 2 - 16 + edge.offset, text, color, full)}</g>`;
  }
  const p1 = borderPoint(A, B.x, B.y);
  const p2 = borderPoint(B, A.x, A.y);
  // lone promises still get a gentle curve so they read as promises, not relations
  const ctrl = controlPoint(p1, p2, edge.offset !== 0 ? edge.offset : 24);
  const anchor = quadPoint(p1, ctrl, p2, edge.labelT);
  const path =
    `<path d="M ${num(p1.x)} ${num(p1.y)} Q ${num(ctrl.x)} ${num(ctrl.y)} ${num(p2.x)} ${num(p2.y)}" fill="none" ` +
    `stroke="${color}" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#${marker})"/>`;
  return `<g class="promise">${path}${tag(anchor.x, anchor.y, text, color, full)}</g>`;
}

/** An outlined label; carries the untruncated text in data-tip when it differs. */
function tag(x: number, y: number, text: string, color: string, title: string): string {
  const w = estW(text, 5.4) + 12;
  // main.ts renders an instant custom tooltip from data-tip
  const hasTip = title !== text;
  const tip = hasTip ? ` data-tip="${escAttr(title)}"` : '';
  return (
    `<g class="tag${hasTip ? ' has-tip' : ''}"${tip} transform="translate(${num(x)},${num(y)})">` +
    `<rect x="${num(-w / 2)}" y="-8.5" width="${num(w)}" height="17" rx="8.5" fill="#fff" stroke="${color}"/>` +
    `<text x="0" y="3.5" text-anchor="middle" font-size="9" fill="${color}" font-weight="500" pointer-events="none">${esc(text)}</text></g>`
  );
}

// --- nodes ------------------------------------------------------------------

function renderNode(
  c: ContextMap['contexts'][number],
  box: NodeBox,
  layers: Layers,
  qlines: string[][],
  metric?: CouplingMetric
): string {
  const x = box.x - box.w / 2;
  const y = box.y - box.h / 2;
  const sub = c.subdomain ? SUBDOMAIN_META[c.subdomain] : undefined;
  const accent = layers.classification && sub ? sub.color : '#334155';

  const out: string[] = [];
  out.push(
    `<rect x="${num(x)}" y="${num(y)}" width="${box.w}" height="${box.h}" rx="10" fill="#fff" ` +
      `stroke="${accent}" stroke-width="1.8" filter="url(#shadow)"/>`
  );
  // accent bar
  out.push(`<rect x="${num(x)}" y="${num(y)}" width="6" height="${box.h}" rx="3" fill="${accent}"/>`);
  // title — clipped to the box; the full name stays available on hover
  const title = clip(c.name, TITLE_MAX);
  const titleTip = title !== c.name ? ` class="has-tip" data-tip="${escAttr(c.name)}"` : '';
  out.push(
    `<text${titleTip} x="${num(x + 16)}" y="${num(y + 25)}" font-size="15" font-weight="700" fill="#0f172a">${esc(title)}</text>`
  );

  let cursor = y + 40;

  if (layers.classification) {
    // classification chips
    let cx = x + 16;
    if (sub) {
      const w = estW(sub.label) + 16;
      out.push(chip(cx, cursor, w, sub.label, sub.color));
      cx += w + 6;
    }
    if (c.cynefin) {
      const cy = CYNEFIN_META[c.cynefin];
      out.push(chip(cx, cursor, estW(cy.label) + 16, cy.label, cy.color));
    }
    cursor += 22;
  }

  if (layers.questions) {
    for (const lines of qlines) {
      out.push(
        `<text x="${num(x + 16)}" y="${num(cursor + 11)}" font-size="11" fill="#7c3aed" font-weight="600">?</text>`
      );
      lines.forEach((line, li) => {
        out.push(
          `<text x="${num(x + 28)}" y="${num(cursor + 11 + li * 15)}" font-size="10.5" fill="#475569">${esc(line)}</text>`
        );
      });
      cursor += lines.length * 15 + 4;
    }
  }

  if (layers.connascence && metric) {
    const i = metric.instability;
    const iColor = i >= 0.75 ? '#dc2626' : i <= 0.25 ? '#16a34a' : '#d97706';
    out.push(
      `<text class="coupling" x="${num(x + 16)}" y="${num(cursor + 12)}" font-size="10" fill="#64748b">` +
        `Ca ${metric.ca} · Ce ${metric.ce} · I ` +
        `<tspan fill="${iColor}" font-weight="700">${i.toFixed(2)}</tspan></text>`
    );
  }

  return `<g class="node">${out.join('')}</g>`;
}

function chip(x: number, y: number, w: number, text: string, color: string): string {
  return (
    `<g class="chip"><rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="16" rx="8" fill="${color}" opacity="0.14"/>` +
    `<text x="${num(x + w / 2)}" y="${num(y + 11.5)}" text-anchor="middle" font-size="9.5" font-weight="600" fill="${color}">${esc(text)}</text></g>`
  );
}

// --- document chrome --------------------------------------------------------

/** Placeholder shown while the model declares no contexts (e.g. an empty editor). */
function renderEmpty(): string {
  const w = 640;
  const h = 360;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="${FONT}">\n` +
    `<rect width="${w}" height="${h}" fill="#fbfbfd"/>\n` +
    `<text class="empty" x="${w / 2}" y="${h / 2}" text-anchor="middle" font-size="14" fill="#64748b">` +
    `No contexts yet — declare one with:  context Sales</text>\n` +
    `</svg>`
  );
}

function defs(): string {
  // `fixed` = absolute size in px. By default a marker scales with its line's
  // stroke width, which is fine for the thin edges but would let the thick risk
  // lines grow arrowheads large enough to swallow the node border.
  const arrow = (id: string, fill: string, fixed?: number) =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" orient="auto-start-reverse" ` +
    (fixed ? `markerUnits="userSpaceOnUse" markerWidth="${fixed}" markerHeight="${fixed}">` : `markerWidth="7" markerHeight="7">`) +
    `<path d="M 0 0 L 10 5 L 0 10 z" fill="${fill}"/></marker>`;
  return (
    '<defs>' +
    arrow('arrow', '#64748b') +
    (Object.keys(RISK_COLOR) as (keyof typeof RISK_COLOR)[]).map((b) => arrow(`arrow-${b}`, RISK_COLOR[b], 16)).join('') +
    arrow('promise', '#0d9488') +
    arrow('promiseUse', '#4f46e5') +
    arrow('imposition', '#dc2626') +
    '<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">' +
    '<feDropShadow dx="0" dy="1.5" stdDeviation="2.5" flood-color="#0f172a" flood-opacity="0.10"/></filter>' +
    '</defs>'
  );
}
