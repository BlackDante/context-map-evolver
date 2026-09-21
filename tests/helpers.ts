import { parse } from '../src/parser';
import { render, type Layers } from '../src/render';
import { LEVELS } from '../src/levels';

export const [L0, L1, L2, L3] = LEVELS.map((l) => l.layers);
export const ALL_ON: Layers = { relations: true, classification: true, questions: true, promise: true, connascence: true };

/** Parse DSL that is expected to be valid; fails loudly if the fixture itself is broken. */
export function model(dsl: string) {
  const { map, errors } = parse(dsl);
  if (errors.length) throw new Error(`fixture DSL has errors:\n${errors.join('\n')}`);
  return map;
}

/**
 * Render and parse the result with a strict XML parser — a stray `<`, an
 * unescaped `&` or an unclosed tag fails here, exactly as it would when the
 * exported .svg file is opened in another tool.
 */
export function svg(dsl: string, layers: Layers, seed = 1): SvgDoc {
  return toDoc(render(model(dsl), layers, seed));
}

export function toDoc(markup: string): SvgDoc {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error(`renderer produced malformed XML: ${err.textContent}`);
  return new SvgDoc(doc, markup);
}

export class SvgDoc {
  constructor(
    readonly doc: Document,
    readonly markup: string
  ) {}

  get root(): Element {
    return this.doc.documentElement;
  }
  /** Elements carrying `cls` among their classes. */
  all(cls: string, within: Element = this.root): Element[] {
    return [...within.querySelectorAll(`[class~="${cls}"]`)];
  }
  nodes(): Element[] {
    return this.all('node');
  }
  /** The node group for a context, looked up by its title text. */
  node(name: string): Element {
    const hit = this.nodes().find((n) => n.querySelector('text')?.textContent === name);
    if (!hit) throw new Error(`no node titled '${name}'`);
    return hit;
  }
  /** Outer box of a context node as {x, y, w, h} (top-left based). */
  box(name: string) {
    const r = this.node(name).querySelector('rect')!;
    return { x: attr(r, 'x'), y: attr(r, 'y'), w: attr(r, 'width'), h: attr(r, 'height') };
  }
  relations(): Element[] {
    return this.all('rel');
  }
  promises(): Element[] {
    return this.all('promise');
  }
  texts(within: Element = this.root): string[] {
    return [...within.querySelectorAll('text')].map((t) => t.textContent ?? '');
  }
  size() {
    return { w: attr(this.root, 'width'), h: attr(this.root, 'height') };
  }
}

export function attr(el: Element, name: string): number {
  return Number(el.getAttribute(name));
}

/** Numbers out of a path's `d`: "M x1 y1 Q cx cy x2 y2" → [x1, y1, cx, cy, x2, y2]. */
export function pathNumbers(el: Element): number[] {
  return (el.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number);
}
