import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTsRunner, type TsReply, type TsRequest, type WorkerLike } from '../src/tsrunner';
import type { TsResult } from '../src/tsmap';

/** A worker that answers only when the test tells it to. */
class FakeWorker implements WorkerLike {
  onmessage: ((event: { data: TsReply }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  received: TsRequest[] = [];
  terminated = false;

  postMessage(request: TsRequest) {
    this.received.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  ready() {
    this.onmessage?.({ data: { ready: true } });
  }
  /** Answer the latest request with a result that names the source it was for. */
  answer(request = this.received[this.received.length - 1]) {
    this.onmessage?.({ data: { id: request.id, result: resultFor(request.source) } });
  }
}

const resultFor = (source: string): TsResult => ({ map: { title: source, contexts: [], relations: [] }, errors: [] });

let workers: FakeWorker[];
const spawn = () => {
  const worker = new FakeWorker();
  workers.push(worker);
  return worker;
};

beforeEach(() => {
  workers = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('TypeScript runner', () => {
  it('spawns no worker until something has to be evaluated', () => {
    const runner = createTsRunner(spawn);
    expect(workers).toHaveLength(0);
    runner.run('a', () => {});
    expect(workers).toHaveLength(1);
  });

  it('waits for the worker to load, then delivers the result', () => {
    const done = vi.fn();
    createTsRunner(spawn).run('a', done);
    expect(workers[0].received).toEqual([]);
    workers[0].ready();
    expect(workers[0].received.map((r) => r.source)).toEqual(['a']);
    workers[0].answer();
    expect(done).toHaveBeenCalledExactlyOnceWith(resultFor('a'));
  });

  it('reuses the worker for the next run', () => {
    const runner = createTsRunner(spawn);
    runner.run('a', () => {});
    workers[0].ready();
    workers[0].answer();
    const done = vi.fn();
    runner.run('b', done);
    workers[0].answer();
    expect(workers).toHaveLength(1);
    expect(done).toHaveBeenCalledWith(resultFor('b'));
  });

  it('evaluates only the latest text when keystrokes outrun the worker', () => {
    const runner = createTsRunner(spawn);
    const [a, b, c] = [vi.fn(), vi.fn(), vi.fn()];
    runner.run('a', a);
    workers[0].ready();
    runner.run('b', b);
    runner.run('c', c);
    expect(workers[0].received.map((r) => r.source)).toEqual(['a']); // one at a time

    workers[0].answer();
    expect(a).not.toHaveBeenCalled(); // overtaken: its result is already out of date
    expect(workers[0].received.map((r) => r.source)).toEqual(['a', 'c']); // 'b' was never run

    workers[0].answer();
    expect(b).not.toHaveBeenCalled();
    expect(c).toHaveBeenCalledExactlyOnceWith(resultFor('c'));
  });

  it('ignores an answer that is not for the run in flight', () => {
    const done = vi.fn();
    createTsRunner(spawn).run('a', done);
    workers[0].ready();
    workers[0].onmessage?.({ data: { id: 999, result: resultFor('stale') } });
    expect(done).not.toHaveBeenCalled();
  });

  it('terminates a run that does not come back and says why', () => {
    const done = vi.fn();
    createTsRunner(spawn, 500).run('while (true) {}', done);
    workers[0].ready();
    vi.advanceTimersByTime(499);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(workers[0].terminated).toBe(true);
    expect(done).toHaveBeenCalledExactlyOnceWith({
      map: null,
      errors: ['the map file ran for more than 0.5 s and was stopped — is there an endless loop?'],
    });
  });

  it('does not start the clock while the worker is still loading', () => {
    const done = vi.fn();
    createTsRunner(spawn, 500).run('a', done);
    vi.advanceTimersByTime(5000);
    expect(done).not.toHaveBeenCalled();
    expect(workers[0].terminated).toBe(false);
  });

  it('starts a fresh worker after a timeout, for the text typed since', () => {
    const runner = createTsRunner(spawn, 500);
    const [stuck, next] = [vi.fn(), vi.fn()];
    runner.run('while (true) {}', stuck);
    workers[0].ready();
    runner.run('fixed', next);
    vi.advanceTimersByTime(500);
    expect(stuck).not.toHaveBeenCalled(); // overtaken by the fix
    expect(workers).toHaveLength(2);
    workers[1].ready();
    workers[1].answer();
    expect(next).toHaveBeenCalledWith(resultFor('fixed'));
  });

  it('stops the clock once the answer is in', () => {
    const done = vi.fn();
    createTsRunner(spawn, 500).run('a', done);
    workers[0].ready();
    workers[0].answer();
    vi.advanceTimersByTime(5000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(workers[0].terminated).toBe(false);
  });

  it('reports a worker that fails to load, and tries again on the next run', () => {
    const runner = createTsRunner(spawn);
    const done = vi.fn();
    runner.run('a', done);
    workers[0].onerror?.(new Error('404'));
    expect(done).toHaveBeenCalledExactlyOnceWith({ map: null, errors: ['the TypeScript evaluator could not be started'] });
    expect(workers).toHaveLength(1); // no retry loop

    runner.run('b', () => {});
    expect(workers).toHaveLength(2);
  });

  it('reports a worker that dies mid-run to whoever asked last', () => {
    const runner = createTsRunner(spawn);
    const [a, b] = [vi.fn(), vi.fn()];
    runner.run('a', a);
    workers[0].ready();
    runner.run('b', b);
    workers[0].onerror?.(new Error('crashed'));
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000); // and the timeout of the dead run does not fire later
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('reports an environment without workers instead of throwing', () => {
    const done = vi.fn();
    const runner = createTsRunner(() => {
      throw new Error('Worker is not defined');
    });
    expect(() => runner.run('a', done)).not.toThrow();
    expect(done).toHaveBeenCalledWith({ map: null, errors: ['the TypeScript evaluator could not be started'] });
  });
});
