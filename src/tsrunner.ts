// Main-thread side of TypeScript evaluation: owns the worker (src/tsworker.ts),
// feeds it the editor text and hands back the model. The worker is spawned on
// first use, so its chunk — sucrase included — is only fetched once somebody
// actually opens a TypeScript map.
import type { TsResult } from './tsmap';

export interface TsRequest {
  id: number;
  source: string;
}

export type TsReply = { ready: true } | { id: number; result: TsResult };

/** The slice of `Worker` the runner needs — tests drive it with a fake. */
export interface WorkerLike {
  postMessage(request: TsRequest): void;
  terminate(): void;
  onmessage: ((event: { data: TsReply }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface TsRunner {
  /**
   * Evaluate `source` and call `done` with the outcome. Only the latest text
   * matters to a live editor: a run that is overtaken by a newer one is dropped
   * and its `done` is never called.
   */
  run(source: string, done: (result: TsResult) => void): void;
}

type Done = (result: TsResult) => void;

/** Long enough for any real map, short enough that an endless loop is not mistaken for a hang of the app. */
export const TIMEOUT_MS = 2000;

export function createTsRunner(spawn: () => WorkerLike, timeoutMs = TIMEOUT_MS): TsRunner {
  let worker: WorkerLike | null = null;
  let ready = false;
  let nextId = 1;
  let active: { id: number; done: Done; timer: ReturnType<typeof setTimeout> } | null = null;
  let waiting: { source: string; done: Done } | null = null;

  /** Start the waiting run, once the worker is up and the previous run is out of the way. */
  function pump() {
    if (active || !waiting) return;
    if (!worker) start();
    if (!worker || !ready) return;
    const { source, done } = waiting;
    waiting = null;
    const id = nextId++;
    active = { id, done, timer: setTimeout(onTimeout, timeoutMs) };
    worker.postMessage({ id, source });
  }

  function start() {
    try {
      worker = spawn();
    } catch {
      onError();
      return;
    }
    worker.onmessage = ({ data }) => {
      if ('ready' in data) {
        ready = true;
        pump();
      } else if (active && data.id === active.id) {
        finish(data.result);
      }
    };
    worker.onerror = onError;
  }

  function stop() {
    worker?.terminate();
    worker = null;
    ready = false;
  }

  function finish(result: TsResult) {
    const run = active!;
    clearTimeout(run.timer);
    active = null;
    if (!waiting) run.done(result);
    pump();
  }

  /** The only way to stop code that does not return is to take its thread away. */
  function onTimeout() {
    stop();
    finish({
      map: null,
      errors: [`the map file ran for more than ${timeoutMs / 1000} s and was stopped — is there an endless loop?`],
    });
  }

  /** The worker could not be loaded. The next run() tries again; retrying here would spin. */
  function onError() {
    stop();
    const done = (waiting ?? active)?.done;
    if (active) clearTimeout(active.timer);
    active = null;
    waiting = null;
    done?.({ map: null, errors: ['the TypeScript evaluator could not be started'] });
  }

  return {
    run(source, done) {
      waiting = { source, done };
      pump();
    },
  };
}
