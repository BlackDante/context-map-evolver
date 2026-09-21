// ---------------------------------------------------------------------------
// The single source-of-truth model. Every "level" of the presentation adds
// more attributes onto THIS model — the diagram never forks, it only enriches.
// ---------------------------------------------------------------------------

/** Level 1: strategic classification of the subdomain a context implements. */
export type Subdomain = 'core' | 'supporting' | 'generic';

/** Level 1: Cynefin sense-making domain — the *nature* of the problem. */
export type Cynefin = 'clear' | 'complicated' | 'complex' | 'chaotic' | 'disorder';

/**
 * Level 2: Promise Theory (Mark Burgess). A promise has a promiser (the context
 * it is declared in), a body, a promisee, an optional condition, and a polarity:
 *   (+) a GIVE / offer promise — "I will provide ..."
 *   (-) a USE / accept promise — "I will use / accept ..."
 * Cooperation needs both: a (+) from the provider AND a matching (-) from the user.
 */
export interface PromiseDecl {
  /** The body — what is promised, in domain language. */
  body: string;
  /** The promisee: who the promise concerns (undefined = to everyone). */
  to?: string;
  /** A promise is voluntary; an imposition is forced onto another agent. */
  kind: 'promise' | 'imposition';
  /** Burgess polarity: '+' give/offer, '-' use/accept. */
  polarity: '+' | '-';
  /** Optional condition the promise is contingent on ("if ..."). */
  condition?: string;
}

/** A bounded context — the primary node of the map. */
export interface Context {
  name: string;
  /** Level 1 */
  subdomain?: Subdomain;
  /** Level 1 */
  cynefin?: Cynefin;
  /** Level 1 — the key business questions this context exists to answer. */
  questions: string[];
  /** Level 2 */
  promises: PromiseDecl[];
  /** Optional manual layout coordinates (otherwise auto force-layout). */
  x?: number;
  y?: number;
}

/**
 * Level 3: Connascence kinds, ordered weakest → strongest (Meilir Page-Jones).
 * Static forms are discoverable by reading code; dynamic forms only at runtime
 * and are therefore far more dangerous across a context boundary.
 */
export type ConnascenceKind =
  // static
  | 'name'
  | 'type'
  | 'meaning'
  | 'position'
  | 'algorithm'
  // dynamic
  | 'execution'
  | 'timing'
  | 'value'
  | 'identity';

export interface Connascence {
  kind: ConnascenceKind;
  /** Same deployable (local) vs across a network/service boundary (distant). */
  locality?: 'local' | 'distant';
  /** How many elements must change together. */
  degree?: number;
}

/**
 * A directed integration relationship. By convention `source` is UPSTREAM and
 * `target` is DOWNSTREAM (influence/data flows source → target), matching the
 * Context Mapper / DDD convention.
 */
export interface Relation {
  source: string;
  target: string;
  /** DDD relationship pattern, e.g. customer-supplier, conformist, partnership. */
  type?: string;
  /** Integration role on the upstream side, e.g. OHS, PL. */
  upstreamRole?: string;
  /** Integration role on the downstream side, e.g. ACL, CF. */
  downstreamRole?: string;
  /** Free-text integration note (protocol, tech, etc.). */
  integration?: string;
  /**
   * Level 3 — weight of this dependency edge when computing afferent/efferent
   * coupling. A heavy integration (many touch-points) counts for more. Default 1.
   */
  coupling?: number;
  /**
   * Level 3 — a single boundary can exhibit several kinds of connascence at
   * once, so this is a list. Each entry is one kind/level to manage.
   */
  connascence: Connascence[];
}

/**
 * Level 3 — afferent/efferent coupling (Robert C. Martin) for one context.
 *  Ca = how many depend ON this context   (incoming, weighted)
 *  Ce = how many this context depends on   (outgoing, weighted)
 *  Instability I = Ce / (Ca + Ce)  →  0 = maximally stable, 1 = maximally unstable
 */
export interface CouplingMetric {
  context: string;
  ca: number;
  ce: number;
  instability: number;
  note: string;
}

export interface ContextMap {
  title: string;
  contexts: Context[];
  relations: Relation[];
}

// ---- lookup metadata used by the renderer & analysis -----------------------

export const SUBDOMAIN_META: Record<Subdomain, { label: string; color: string; invest: string }> = {
  core: { label: 'Core', color: '#7c3aed', invest: 'Invest most — your competitive edge. Build in-house.' },
  supporting: { label: 'Supporting', color: '#2563eb', invest: 'Necessary but not differentiating. Build pragmatically.' },
  generic: { label: 'Generic', color: '#64748b', invest: 'Buy / adopt off-the-shelf. Minimise custom effort.' },
};

export const CYNEFIN_META: Record<Cynefin, { label: string; color: string; act: string }> = {
  clear: { label: 'Clear', color: '#16a34a', act: 'Best practice. Sense → categorise → respond.' },
  complicated: { label: 'Complicated', color: '#0891b2', act: 'Good practice. Sense → analyse → respond (experts).' },
  complex: { label: 'Complex', color: '#d97706', act: 'Emergent. Probe → sense → respond (experiments).' },
  chaotic: { label: 'Chaotic', color: '#dc2626', act: 'Novel. Act → sense → respond (stabilise first).' },
  disorder: { label: 'Disorder', color: '#9ca3af', act: 'Unknown domain — break it down until it is knowable.' },
};

/** Strength rank 1 (weakest) … 9 (strongest). Dynamic forms rank above static. */
export const CONNASCENCE_META: Record<ConnascenceKind, { label: string; rank: number; dynamic: boolean }> = {
  name: { label: 'Name', rank: 1, dynamic: false },
  type: { label: 'Type', rank: 2, dynamic: false },
  meaning: { label: 'Meaning', rank: 3, dynamic: false },
  position: { label: 'Position', rank: 4, dynamic: false },
  algorithm: { label: 'Algorithm', rank: 5, dynamic: false },
  execution: { label: 'Execution', rank: 6, dynamic: true },
  timing: { label: 'Timing', rank: 7, dynamic: true },
  value: { label: 'Value', rank: 8, dynamic: true },
  identity: { label: 'Identity', rank: 9, dynamic: true },
};
