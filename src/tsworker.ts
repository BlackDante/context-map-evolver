// Web Worker that runs TypeScript map files. A map file is a program, and the
// editor re-runs it on every keystroke — off the main thread it cannot touch
// the page, and a half-typed endless loop can be terminated (see tsrunner.ts)
// instead of freezing the tab.
import { evaluateTs } from './tsmap';
import type { TsReply, TsRequest } from './tsrunner';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<TsRequest>) => void) | null;
  postMessage(reply: TsReply): void;
};

scope.onmessage = (event) => {
  scope.postMessage({ id: event.data.id, result: evaluateTs(event.data.source) });
};
scope.postMessage({ ready: true });
