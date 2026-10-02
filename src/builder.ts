// The TypeScript way to write a model. Contexts are variables, so relations and
// promises point at objects instead of repeating names — and the result is the
// very same ContextMap the .cme parser produces, so every lens works unchanged.
//
//   const legal = context('Legal', { subdomain: 'core' });
//   const availability = context('Availability');
//   legal.promises('authoritative licensing rules').to(availability);
//   legal.upstreamOf(availability, { type: 'customer-supplier' }).connascence('meaning', 'distant', 3);
//   export default map('Media Rights Platform', legal, availability);
//
// Like the parser, the builder never throws: the browser editor runs map files
// without type-checking them, so everything is validated here and reported as a
// message, while whatever could be understood still ends up on the map.
//
// This file is also the package's library entry (it is what gives an IDE the
// types for `import { context, map } from 'context-map-evolver'`) — hence the
// `.js` in its relative imports: the emitted .d.ts must resolve under Node's ESM
// rules too.
import type {
  Connascence,
  ConnascenceKind,
  Context,
  ContextMap,
  Cynefin,
  PromiseDecl,
  Relation,
  Subdomain,
} from './model.js';
import { CONNASCENCE_META, CYNEFIN_META, SUBDOMAIN_META } from './model.js';

export type { Connascence, ConnascenceKind, Context, ContextMap, Cynefin, PromiseDecl, Relation, Subdomain };

export interface ContextOptions {
  /** L1 — strategic classification of the subdomain this context implements. */
  subdomain?: Subdomain;
  /** L1 — the nature of the problem (Cynefin). */
  cynefin?: Cynefin;
  /** L1 — the key business questions this context exists to answer. */
  questions?: string[];
  /** Pin the context at these coordinates; the automatic layout will not move it. */
  at?: [x: number, y: number];
}

/** The common DDD relationship patterns; any other string is accepted too. */
export type RelationType =
  | 'partnership'
  | 'shared-kernel'
  | 'customer-supplier'
  | 'conformist'
  | 'anticorruption-layer'
  | 'open-host-service'
  | 'published-language'
  | 'separate-ways'
  | (string & {});

export interface RelationOptions {
  /** The DDD relationship pattern. */
  type?: RelationType;
  /** Integration role on the upstream side, e.g. `'OHS'`, `'PL'`. */
  upstream?: string;
  /** Integration role on the downstream side, e.g. `'ACL'`, `'CF'`. */
  downstream?: string;
  /** Free-text note about how the integration happens (protocol, technology). */
  integration?: string;
  /** L3 — weight of this edge when computing Ca / Ce. Positive, default 1. */
  coupling?: number;
}

export type Locality = 'local' | 'distant';

/** A give-promise (+): "I will provide …". */
export interface GivePromise {
  /** The promisee. Leave it out for a promise to everyone. */
  to(promisee: ContextBuilder): this;
  /** The condition the promise is contingent on. */
  if(condition: string): this;
}

/** A use-promise (−): "I will accept / rely on …". */
export interface UsePromise {
  /** The context whose promise is being used. */
  from(provider: ContextBuilder): this;
  /** The condition the promise is contingent on. */
  if(condition: string): this;
}

/** Not a promise: an attempt to force behaviour onto another context. */
export interface Imposition {
  /** The context the behaviour is imposed on. */
  on(target: ContextBuilder): this;
  if(condition: string): this;
}

interface ContextState {
  context: Context;
  /** Stamped with a global sequence so the map keeps relations in declaration order. */
  relations: { seq: number; relation: Relation }[];
  issues: string[];
}

const CONTEXT_OPTIONS = ['subdomain', 'cynefin', 'questions', 'at'];
const RELATION_OPTIONS = ['type', 'upstream', 'downstream', 'integration', 'coupling'];

// internals live outside the classes so that an IDE's completion list shows the
// modelling vocabulary and nothing else
const states = new WeakMap<ContextBuilder, ContextState>();
let sequence = 0;

/** A bounded context — a box on the map. Create one with {@link context}. */
export class ContextBuilder {
  readonly name: string;

  constructor(name: string, options: ContextOptions = {}) {
    this.name = typeof name === 'string' ? name : String(name);
    const issues: string[] = [];
    const ctx: Context = { name: this.name, questions: [], promises: [] };
    const label = `context '${this.name}'`;
    if (typeof name !== 'string' || !name.trim()) issues.push(`context() expects a name, got ${show(name)}`);

    const opts = optionsOf(options, CONTEXT_OPTIONS, label, issues);
    if (opts.subdomain !== undefined) {
      if (has(SUBDOMAIN_META, opts.subdomain)) ctx.subdomain = opts.subdomain as Subdomain;
      else issues.push(`${label}: subdomain must be ${Object.keys(SUBDOMAIN_META).join(' | ')}`);
    }
    if (opts.cynefin !== undefined) {
      if (has(CYNEFIN_META, opts.cynefin)) ctx.cynefin = opts.cynefin as Cynefin;
      else issues.push(`${label}: cynefin must be ${Object.keys(CYNEFIN_META).join(' | ')}`);
    }
    if (opts.questions !== undefined) {
      if (Array.isArray(opts.questions) && opts.questions.every((q) => typeof q === 'string')) ctx.questions = [...opts.questions];
      else issues.push(`${label}: questions expects a list of strings`);
    }
    if (opts.at !== undefined) {
      const at = opts.at;
      if (Array.isArray(at) && at.length === 2 && at.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        [ctx.x, ctx.y] = at;
      } else {
        issues.push(`${label}: at expects two numbers, e.g. at: [400, 200]`);
      }
    }
    states.set(this, { context: ctx, relations: [], issues });
  }

  /** A give-promise (+): `legal.promises('licensing rules').to(availability)`. */
  promises(body: string): GivePromise {
    return promise(this, 'promise', '+', body);
  }

  /** A use-promise (−): `orders.uses('payment confirmation').from(payments)`. */
  uses(body: string): UsePromise {
    return promise(this, 'promise', '-', body);
  }

  /** An imposition: `carrier.imposes('you must use our label format').on(warehouse)`. */
  imposes(body: string): Imposition {
    return promise(this, 'imposition', '+', body);
  }

  /**
   * A directed integration: this context is UPSTREAM, `downstream` depends on
   * it. Call it again for the same pair to model several integrations.
   */
  upstreamOf(downstream: ContextBuilder, options: RelationOptions = {}): RelationBuilder {
    const state = states.get(this)!;
    if (!(downstream instanceof ContextBuilder)) {
      state.issues.push(`context '${this.name}': upstreamOf() expects a context, got ${show(downstream)}`);
      // not on the map, but still chainable — `.connascence()` must not throw
      return new RelationBuilder({ source: this.name, target: '', connascence: [] }, state.issues);
    }
    const relation: Relation = { source: this.name, target: downstream.name, connascence: [] };
    const label = relationLabel(relation);
    const opts = optionsOf(options, RELATION_OPTIONS, label, state.issues);
    for (const [option, field] of [
      ['type', 'type'],
      ['upstream', 'upstreamRole'],
      ['downstream', 'downstreamRole'],
      ['integration', 'integration'],
    ] as const) {
      const value = opts[option];
      if (value === undefined) continue;
      if (typeof value === 'string' && value) relation[field] = value;
      else state.issues.push(`${label}: ${option} expects a non-empty string`);
    }
    if (opts.coupling !== undefined) {
      const w = opts.coupling;
      if (typeof w === 'number' && Number.isFinite(w) && w > 0) relation.coupling = w;
      else state.issues.push(`${label}: coupling expects a positive number`);
    }
    state.relations.push({ seq: sequence++, relation });
    return new RelationBuilder(relation, state.issues);
  }
}

/** What `upstreamOf()` returns: the place to declare the connascence on that boundary. */
export class RelationBuilder {
  #relation: Relation;
  #issues: string[];

  constructor(relation: Relation, issues: string[]) {
    this.#relation = relation;
    this.#issues = issues;
  }

  /**
   * One kind of connascence this boundary exhibits; chain it to declare several.
   * Locality defaults to `'local'`, degree (how many elements change together) to 2.
   */
  connascence(kind: ConnascenceKind, locality?: Locality, degree?: number): this;
  connascence(kind: ConnascenceKind, degree: number): this;
  connascence(kind: ConnascenceKind, ...details: (Locality | number | undefined)[]): this {
    const label = relationLabel(this.#relation);
    if (!has(CONNASCENCE_META, kind)) {
      this.#issues.push(
        `${label}: unknown connascence kind ${show(kind)} — expected ${Object.keys(CONNASCENCE_META).join(' | ')}`
      );
      return this;
    }
    const con: Connascence = { kind };
    // like the DSL, locality and degree are accepted in either order
    for (const detail of details) {
      if (detail === undefined) continue;
      if (detail === 'local' || detail === 'distant') con.locality = detail;
      else if (typeof detail === 'number' && Number.isInteger(detail) && detail >= 0) con.degree = detail;
      else this.#issues.push(`${label}: connascence ${kind} takes 'local' | 'distant' and a whole-number degree, got ${show(detail)}`);
    }
    this.#relation.connascence.push(con);
    return this;
  }
}

/** What `map()` returns — the value a map file must `export default`. */
export class MapDefinition {
  #title: string;
  #contexts: ContextBuilder[];

  constructor(title: string, contexts: ContextBuilder[]) {
    this.#title = title;
    this.#contexts = contexts;
  }

  /**
   * The plain model, plus every problem found while building it. Whatever could
   * be understood is in `map` even when `errors` is not empty.
   */
  toModel(): { map: ContextMap; errors: string[] } {
    const errors: string[] = [];
    const model: ContextMap = { title: 'Untitled map', contexts: [], relations: [] };
    if (typeof this.#title === 'string' && this.#title) model.title = this.#title;
    else errors.push(`map() expects a title as its first argument, got ${show(this.#title)}`);

    const listed: ContextState[] = [];
    const known = new Set<string>();
    for (const item of this.#contexts) {
      const state = item instanceof ContextBuilder ? states.get(item) : undefined;
      if (!state) {
        errors.push(`map() expects contexts after the title, got ${show(item)}`);
        continue;
      }
      const { name } = state.context;
      if (known.has(name)) {
        // two boxes with one name would be indistinguishable to every relation
        errors.push(`duplicate context '${name}' — ignored`);
        continue;
      }
      errors.push(...state.issues);
      if (!name.trim()) continue; // reported by context(); a nameless box cannot be drawn
      known.add(name);
      listed.push(state);
    }

    // copies, so that the model handed out is not changed by later builder calls
    model.contexts = listed.map(({ context: c }) => ({ ...c, questions: [...c.questions], promises: c.promises.map((p) => ({ ...p })) }));
    model.relations = listed
      .flatMap((s) => s.relations)
      .sort((a, b) => a.seq - b.seq)
      .map(({ relation: r }) => ({ ...r, connascence: r.connascence.map((c) => ({ ...c })) }));

    // everything that names a context must name one that is on the map
    for (const r of model.relations) {
      if (!known.has(r.target)) errors.push(`${relationLabel(r)}: '${r.target}' is not passed to map()`);
      if (r.source === r.target) errors.push(`'${r.source}' cannot have a relation with itself`);
    }
    for (const c of model.contexts) {
      for (const p of c.promises) {
        if (p.to == null) continue;
        if (!known.has(p.to)) errors.push(`context '${c.name}': ${p.kind} "${p.body}" names '${p.to}', which is not passed to map()`);
        else if (p.to === c.name) errors.push(`'${c.name}' cannot make a ${p.kind} to itself`);
      }
    }
    return { map: model, errors };
  }
}

/** Declare a bounded context. Keep the result in a variable: relations and promises refer to it. */
export function context(name: string, options?: ContextOptions): ContextBuilder {
  return new ContextBuilder(name, options);
}

/**
 * Put contexts on a map. Only the contexts listed here are drawn, in this
 * order; their relations and promises come along with them.
 */
export function map(title: string, ...contexts: ContextBuilder[]): MapDefinition {
  return new MapDefinition(title, contexts);
}

// ---- helpers ---------------------------------------------------------------

function promise(
  owner: ContextBuilder,
  kind: PromiseDecl['kind'],
  polarity: PromiseDecl['polarity'],
  body: string
): GivePromise & UsePromise & Imposition {
  const state = states.get(owner)!;
  const label = `context '${owner.name}'`;
  const verb = kind === 'imposition' ? 'imposes' : polarity === '-' ? 'uses' : 'promises';
  const decl: PromiseDecl = { body: String(body), kind, polarity };
  if (typeof body === 'string' && body) state.context.promises.push(decl);
  else state.issues.push(`${label}: ${verb}() expects the body as a string, e.g. ${verb}('fresh prices')`);

  // to / from / on all name the counterpart, exactly as in the DSL; the types
  // offer only the word that reads naturally for each kind
  const counterpart = (word: string) => (other: ContextBuilder) => {
    if (other instanceof ContextBuilder) decl.to = other.name;
    else state.issues.push(`${label}: ${verb}("${decl.body}").${word}() expects a context, got ${show(other)}`);
    return handle;
  };
  const handle = {
    to: counterpart('to'),
    from: counterpart('from'),
    on: counterpart('on'),
    if(condition: string) {
      if (typeof condition === 'string' && condition) decl.condition = condition;
      else state.issues.push(`${label}: ${verb}("${decl.body}").if() expects the condition as a string`);
      return handle;
    },
  };
  return handle;
}

/** The options bag as a loose record, with unknown keys reported — a typo must not pass silently. */
function optionsOf(options: object, allowed: string[], label: string, issues: string[]): Record<string, unknown> {
  if (options == null) return {};
  if (typeof options !== 'object' || Array.isArray(options)) {
    issues.push(`${label}: options must be an object, got ${show(options)}`);
    return {};
  }
  for (const key of Object.keys(options)) {
    if (!allowed.includes(key)) issues.push(`${label}: unknown option '${key}' — expected ${allowed.join(' | ')}`);
  }
  return options as Record<string, unknown>;
}

function relationLabel(r: Relation): string {
  return `relation ${r.source} -> ${r.target}`;
}

/** Own-key check — `in` would also accept `constructor`, `toString`, … */
function has(table: object, key: unknown): boolean {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);
}

/** A value as it would be written in source, for messages. */
function show(value: unknown): string {
  if (typeof value === 'string') return `'${value}'`;
  if (value instanceof ContextBuilder) return `context '${value.name}'`;
  if (Array.isArray(value)) return 'an array';
  if (value !== null && typeof value === 'object') return 'an object';
  return String(value);
}
