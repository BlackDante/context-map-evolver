import type { Layers } from './render';

export interface Level {
  name: string;
  layers: Layers;
}

// Each level is a distinct LENS, not a cumulative pile. L2 hides structural
// relations to focus on promises; L3 hides promises (and question clutter) to
// focus on coupling.
export const LEVELS: readonly Level[] = [
  {
    name: 'L0 · Structure',
    layers: { relations: true, classification: false, questions: false, promise: false, connascence: false },
  },
  {
    name: 'L1 · Strategic (Cynefin + Questions)',
    layers: { relations: true, classification: true, questions: true, promise: false, connascence: false },
  },
  {
    name: 'L2 · Promise Theory',
    layers: { relations: false, classification: true, questions: false, promise: true, connascence: false },
  },
  {
    name: 'L3 · Coupling & Connascence',
    layers: { relations: false, classification: true, questions: false, promise: false, connascence: true },
  },
];
