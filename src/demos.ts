// A progression of sample models, each one level richer than the last. They
// double as a teaching aid: the same DSL, gaining a new analytical dimension at
// every step — mirroring the talk's "one evolving artifact" thesis.
//
// The models live in examples/*.cme as plain DSL files, so they can also be
// imported into the app, diffed, and read on their own.
import minimal from '../examples/01-minimal.cme?raw';
import classic from '../examples/02-classic-context-map.cme?raw';
import strategic from '../examples/03-strategic.cme?raw';
import promises from '../examples/04-promise-theory.cme?raw';
import full from '../examples/05-coupling-and-connascence.cme?raw';

export interface Demo {
  id: string;
  name: string;
  /** Detail level (slider value) that best shows this demo off. */
  level: number;
  dsl: string;
}

export const DEMOS: Demo[] = [
  { id: 'minimal', name: '1 · Minimal — structure', level: 0, dsl: minimal },
  { id: 'classic', name: '2 · Classic context map', level: 0, dsl: classic },
  { id: 'strategic', name: '3 · Strategic — Cynefin + questions', level: 1, dsl: strategic },
  { id: 'promises', name: '4 · Promise theory', level: 2, dsl: promises },
  { id: 'full', name: '5 · Full — coupling & connascence', level: 3, dsl: full },
];

export const DEFAULT_DEMO_ID = 'full';
