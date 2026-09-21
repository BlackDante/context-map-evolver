import type { Connascence, ContextMap, CouplingMetric, Relation } from './model';
import { CONNASCENCE_META, SUBDOMAIN_META } from './model';

export type Band = 'low' | 'medium' | 'high';

const band = (score: number): Band => (score >= 66 ? 'high' : score >= 38 ? 'medium' : 'low');

export interface KindRisk {
  con: Connascence;
  score: number;
  band: Band;
  reason: string;
}

export interface RelationRisk {
  rel: Relation;
  /** 0..100 — risk of the strongest connascence on this boundary. */
  score: number;
  band: Band;
  /** One entry per connascence kind declared on the relation. */
  kinds: KindRisk[];
}

/**
 * Level 3: turn a single connascence annotation into an operational-risk number.
 * Stronger connascence + crossing a distributed boundary + higher degree =
 * more things that must change together = more risk.
 */
export function scoreConnascence(con: Connascence): KindRisk {
  const meta = CONNASCENCE_META[con.kind];
  const distant = con.locality === 'distant';
  const degree = con.degree ?? 2;

  let score = (meta.rank / 9) * 60; // base from strength rank (1..9) → 0..60
  if (distant) score += meta.dynamic ? 28 : 14; // dynamic-across-a-boundary trap
  score += Math.min(degree, 8) * 1.5; // degree amplifies
  score = Math.min(100, Math.round(score));

  const reason = [
    `${meta.dynamic ? 'dynamic' : 'static'} connascence of ${meta.label} (rank ${meta.rank}/9)`,
    distant ? 'across a distributed boundary' : 'within one deployable',
    `degree ~${degree}`,
  ].join(', ');
  return { con, score, band: band(score), reason };
}

/** Aggregate every connascence kind on a relation; headline = the strongest. */
export function scoreRelation(rel: Relation): RelationRisk | null {
  if (!rel.connascence.length) return null;
  const kinds = rel.connascence.map(scoreConnascence).sort((a, b) => b.score - a.score);
  const score = kinds[0].score;
  return { rel, score, band: band(score), kinds };
}

export function allRisks(map: ContextMap): RelationRisk[] {
  return map.relations
    .map(scoreRelation)
    .filter((r): r is RelationRisk => r !== null)
    .sort((a, b) => b.score - a.score);
}

/**
 * Level 3: afferent / efferent coupling per context (Robert C. Martin).
 * Our arrows are upstream → downstream, and the downstream *depends on* the
 * upstream. So for context C:
 *   Ca = Σ coupling of relations where C is the SOURCE   (others depend on C)
 *   Ce = Σ coupling of relations where C is the TARGET   (C depends on others)
 * Instability I = Ce / (Ca + Ce).  I≈0 stable, I≈1 unstable.
 */
export function couplingMetrics(map: ContextMap): CouplingMetric[] {
  const ca = new Map<string, number>();
  const ce = new Map<string, number>();
  for (const c of map.contexts) {
    ca.set(c.name, 0);
    ce.set(c.name, 0);
  }
  for (const r of map.relations) {
    const w = r.coupling ?? 1;
    if (ca.has(r.source)) ca.set(r.source, ca.get(r.source)! + w);
    if (ce.has(r.target)) ce.set(r.target, ce.get(r.target)! + w);
  }
  return map.contexts.map((c) => {
    const a = ca.get(c.name)!;
    const e = ce.get(c.name)!;
    const total = a + e;
    const instability = total === 0 ? 0 : e / total;
    let note: string;
    if (total === 0) note = 'Isolated — no integrations declared.';
    else if (instability <= 0.25) note = 'Stable: many depend on it, it depends on little. Changes ripple — keep its contract sharp.';
    else if (instability >= 0.75) note = 'Unstable: depends outward, little depends on it. Cheap to change.';
    else note = 'Balanced dependencies.';
    return { context: c.name, ca: a, ce: e, instability: Math.round(instability * 100) / 100, note };
  });
}

export interface SdpViolation {
  rel: Relation;
  dependerI: number;
  dependeeI: number;
}

/**
 * Stable Dependencies Principle: depend in the direction of stability.
 * The downstream (target) depends on the upstream (source); the depender should
 * be at least as unstable as what it depends on. If I(downstream) < I(upstream)
 * a more-stable context leans on a less-stable one — a structural smell.
 */
export function sdpViolations(map: ContextMap): SdpViolation[] {
  const byName = new Map(couplingMetrics(map).map((m) => [m.context, m.instability]));
  const out: SdpViolation[] = [];
  // the principle is about the PAIR of contexts: several parallel relations
  // between the same two are still one violation, not one per edge
  const seen = new Set<string>();
  for (const r of map.relations) {
    const dependerI = byName.get(r.target); // downstream depends on upstream
    const dependeeI = byName.get(r.source);
    if (dependerI == null || dependeeI == null) continue;
    const pair = JSON.stringify([r.source, r.target]);
    if (seen.has(pair)) continue;
    seen.add(pair);
    if (dependerI + 1e-9 < dependeeI) out.push({ rel: r, dependerI, dependeeI });
  }
  return out;
}

export interface StrategicAdvice {
  context: string;
  note: string;
}

/** Level 1: cheap heuristics that turn classification into a recommendation. */
export function strategicAdvice(map: ContextMap): StrategicAdvice[] {
  const out: StrategicAdvice[] = [];
  for (const c of map.contexts) {
    if (c.subdomain) {
      out.push({ context: c.name, note: SUBDOMAIN_META[c.subdomain].invest });
    }
    // smell: a Generic subdomain wearing Complex problem-nature, or vice versa
    if (c.subdomain === 'core' && c.cynefin === 'clear') {
      out.push({
        context: c.name,
        note: '⚠ Marked Core but the problem looks Clear — is it really differentiating, or could it be bought?',
      });
    }
    if (c.subdomain === 'generic' && c.cynefin === 'complex') {
      out.push({
        context: c.name,
        note: '⚠ Marked Generic but the problem is Complex — buying may not fit; re-check the classification.',
      });
    }
    if (c.questions.length === 0) {
      out.push({
        context: c.name,
        note: '⚠ No key questions defined — what business question does this context exist to answer?',
      });
    }
  }
  return out;
}

export interface PromiseEdge {
  from: string;
  to?: string;
  body: string;
  kind: 'promise' | 'imposition';
  polarity: '+' | '-';
  condition?: string;
}

/** Level 2: flatten promises into edges for the promise overlay. */
export function promiseEdges(map: ContextMap): PromiseEdge[] {
  const edges: PromiseEdge[] = [];
  for (const c of map.contexts) {
    for (const pr of c.promises) {
      edges.push({
        from: c.name,
        to: pr.to,
        body: pr.body,
        kind: pr.kind,
        polarity: pr.polarity,
        condition: pr.condition,
      });
    }
  }
  return edges;
}
