import { describe, expect, it } from 'vitest';
import {
  allRisks,
  couplingMetrics,
  promiseEdges,
  scoreConnascence,
  scoreRelation,
  sdpViolations,
  strategicAdvice,
} from '../src/analysis';
import { CONNASCENCE_META, type ConnascenceKind } from '../src/model';
import { model } from './helpers';

describe('scoreConnascence', () => {
  const kinds = Object.keys(CONNASCENCE_META) as ConnascenceKind[];

  it('rises monotonically with connascence strength', () => {
    const scores = kinds.map((kind) => scoreConnascence({ kind }).score);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    expect(new Set(scores).size).toBe(kinds.length);
  });

  it('penalises crossing a boundary, and dynamic kinds twice as hard', () => {
    const delta = (kind: ConnascenceKind) =>
      scoreConnascence({ kind, locality: 'distant' }).score - scoreConnascence({ kind, locality: 'local' }).score;
    expect(delta('name')).toBe(14);
    expect(delta('timing')).toBe(28);
  });

  it('treats an unspecified locality as local', () => {
    expect(scoreConnascence({ kind: 'value' }).score).toBe(scoreConnascence({ kind: 'value', locality: 'local' }).score);
  });

  it('amplifies by degree, defaulting to 2 and saturating at 8', () => {
    const at = (degree?: number) => scoreConnascence({ kind: 'name', degree }).score;
    expect(at()).toBe(at(2));
    expect(at(5)).toBeGreaterThan(at(2));
    expect(at(50)).toBe(at(8));
  });

  it('stays within 0..100 and bands the extremes sensibly', () => {
    const worst = scoreConnascence({ kind: 'identity', locality: 'distant', degree: 8 });
    const best = scoreConnascence({ kind: 'name', locality: 'local', degree: 1 });
    expect(worst).toMatchObject({ score: 100, band: 'high' });
    expect(best).toMatchObject({ score: 8, band: 'low' });
  });

  it('puts band edges at 38 and 66', () => {
    // meaning distant 3 → 20 + 14 + 4.5 = 38.5 → 39
    expect(scoreConnascence({ kind: 'meaning', locality: 'distant', degree: 3 })).toMatchObject({ score: 39, band: 'medium' });
    // algorithm distant 2 → 33.3 + 14 + 3 = 50.3 → 50
    expect(scoreConnascence({ kind: 'algorithm', locality: 'distant', degree: 2 }).band).toBe('medium');
    // timing local 2 → 46.7 + 3 → 50; timing distant → 78
    expect(scoreConnascence({ kind: 'timing', locality: 'distant', degree: 2 })).toMatchObject({ score: 78, band: 'high' });
  });

  it('explains itself in words', () => {
    expect(scoreConnascence({ kind: 'value', locality: 'distant', degree: 2 }).reason).toBe(
      'dynamic connascence of Value (rank 8/9), across a distributed boundary, degree ~2'
    );
  });
});

describe('scoreRelation / allRisks', () => {
  const map = model(`
context A
context B
context C
A -> B { connascence name local 1  connascence value distant 2 }
B -> C { connascence identity distant 8 }
A -> C
`);

  it('is null for a relation without connascence', () => {
    expect(scoreRelation(map.relations[2])).toBeNull();
  });

  it('headlines the strongest kind and lists the rest in descending order', () => {
    const rs = scoreRelation(map.relations[0])!;
    expect(rs.score).toBe(84);
    expect(rs.kinds.map((k) => k.con.kind)).toEqual(['value', 'name']);
  });

  it('ranks boundaries riskiest first and skips unscored ones', () => {
    expect(allRisks(map).map((r) => `${r.rel.source}->${r.rel.target}`)).toEqual(['B->C', 'A->B']);
  });
});

describe('couplingMetrics', () => {
  it('counts Ca on the upstream side and Ce on the downstream side, weighted', () => {
    const m = couplingMetrics(model('context Up\ncontext Down\nUp -> Down { coupling 3 }\nUp -> Down'));
    expect(m).toMatchObject([
      { context: 'Up', ca: 4, ce: 0, instability: 0 },
      { context: 'Down', ca: 0, ce: 4, instability: 1 },
    ]);
  });

  it('computes I = Ce / (Ca + Ce), rounded to two places', () => {
    const m = couplingMetrics(model('context A\ncontext B\ncontext C\nA -> B { coupling 2 }\nB -> C'));
    expect(m.find((x) => x.context === 'B')).toMatchObject({ ca: 1, ce: 2, instability: 0.67 });
  });

  it('calls an unconnected context isolated rather than stable', () => {
    const [m] = couplingMetrics(model('context Island'));
    expect(m).toMatchObject({ ca: 0, ce: 0, instability: 0 });
    expect(m.note).toMatch(/Isolated/);
  });

  it('describes stable, balanced and unstable contexts differently', () => {
    const notes = couplingMetrics(model('context A\ncontext B\ncontext C\nA -> B\nB -> C')).map((m) => m.note);
    expect(notes[0]).toMatch(/^Stable/);
    expect(notes[1]).toMatch(/^Balanced/);
    expect(notes[2]).toMatch(/^Unstable/);
  });
});

describe('sdpViolations', () => {
  it('passes a map whose dependencies point towards stability', () => {
    expect(sdpViolations(model('context A\ncontext B\ncontext C\nA -> B\nB -> C'))).toEqual([]);
  });

  it('flags a stable context depending on a less stable one', () => {
    // Hub is depended on by three contexts (stable) yet depends on Flaky,
    // which itself leans on two others (unstable).
    const map = model(`
context Hub
context Flaky
context X
context Y
context Z
context P
context Q
Hub -> X
Hub -> Y
Hub -> Z
Flaky -> Hub
P -> Flaky
Q -> Flaky
`);
    const v = sdpViolations(map);
    expect(v).toHaveLength(1);
    expect(v[0].rel).toMatchObject({ source: 'Flaky', target: 'Hub' });
    expect(v[0].dependerI).toBeLessThan(v[0].dependeeI);
  });

  it('reports a violating pair once even with parallel relations', () => {
    const map = model(`
context Hub
context Flaky
context X
context Y
context Z
context P
context Q
context R
context S
Hub -> X
Hub -> Y
Hub -> Z
Hub -> R
Hub -> S
Flaky -> Hub
Flaky -> Hub
P -> Flaky
Q -> Flaky
R -> Flaky
S -> Flaky
`);
    expect(sdpViolations(map)).toHaveLength(1);
  });
});

describe('strategicAdvice', () => {
  const notes = (dsl: string) => strategicAdvice(model(dsl)).map((a) => a.note);

  it('gives investment advice per subdomain', () => {
    expect(notes('context A { subdomain generic question "q" }')).toEqual([
      'Buy / adopt off-the-shelf. Minimise custom effort.',
    ]);
  });

  it('questions a Core context whose problem is Clear', () => {
    expect(notes('context A { subdomain core cynefin clear question "q" }').join()).toMatch(/could it be bought/);
  });

  it('questions a Generic context whose problem is Complex', () => {
    expect(notes('context A { subdomain generic cynefin complex question "q" }').join()).toMatch(/re-check/);
  });

  it('nudges towards defining key questions', () => {
    expect(notes('context A')).toEqual([expect.stringMatching(/No key questions/)]);
  });
});

describe('promiseEdges', () => {
  it('flattens promises into edges from their promiser, in declaration order', () => {
    const edges = promiseEdges(
      model('context A { promise "one" to B  promise - "two" from B if "c" }\ncontext B { imposition "three" on A }')
    );
    expect(edges).toEqual([
      { from: 'A', to: 'B', body: 'one', kind: 'promise', polarity: '+', condition: undefined },
      { from: 'A', to: 'B', body: 'two', kind: 'promise', polarity: '-', condition: 'c' },
      { from: 'B', to: 'A', body: 'three', kind: 'imposition', polarity: '+', condition: undefined },
    ]);
  });
});
