// Turns the text of a TypeScript map file into a ContextMap: strip the types,
// run the code against the builder API, take its default export.
//
// Pulls in sucrase, so only the worker (src/tsworker.ts) imports this — the
// main bundle, and everyone who only ever writes .cme, never pays for it.
import { transform } from 'sucrase';
import * as api from './builder';
import type { ContextMap } from './model';

export interface TsResult {
  /** The model, or null when the file could not be run at all. */
  map: ContextMap | null;
  /** Problems, in the same spirit as the parser's: `line N: …` wherever a line is known. */
  errors: string[];
}

/** The only module a map file can import. */
export const MODULE_NAME = 'context-map-evolver';

// names the evaluated code in stack traces, which is how a runtime error finds its line
const SOURCE_URL = 'map.cme.ts';
const FRAME = /map\.cme\.ts:(\d+):\d+/;

export function evaluateTs(source: string): TsResult {
  let code: string;
  try {
    // sucrase keeps every line where it was, so line numbers still match the editor
    code = transform(source, { transforms: ['typescript', 'imports'] }).code;
  } catch (err) {
    return failure(syntaxMessage(err));
  }

  const module = { exports: {} as Record<string, unknown> };
  try {
    run(code, module);
  } catch (err) {
    return failure(runtimeMessage(err));
  }

  const exported = module.exports.default;
  if (!(exported instanceof api.MapDefinition)) {
    return failure(`a map file must end with 'export default map("Title", …contexts)'`);
  }
  return exported.toModel();
}

function run(code: string, module: { exports: Record<string, unknown> }): void {
  const require = (name: string) => {
    if (name === MODULE_NAME) return api;
    throw new Error(`cannot import '${name}' — a map file can only import '${MODULE_NAME}'`);
  };
  new Function('require', 'module', 'exports', `${code}\n//# sourceURL=${SOURCE_URL}`)(require, module, module.exports);
}

function failure(message: string): TsResult {
  return { map: null, errors: [message] };
}

function syntaxMessage(err: unknown): string {
  const { message, loc } = err as { message?: string; loc?: { line: number } };
  // sucrase appends its own "(line:column)"; the line goes up front instead, like every other message
  const text = (message ?? String(err)).replace(/\s*\(\d+:\d+\)$/, '');
  return loc ? `line ${loc.line}: ${text}` : text;
}

function runtimeMessage(err: unknown): string {
  if (!(err instanceof Error)) return `the map file threw ${String(err)}`;
  const text = `${err.name}: ${err.message}`;
  const line = lineOf(err);
  return line ? `line ${line}: ${text}` : text;
}

/** The line of the map file an error came from, when the engine's stack trace tells. */
function lineOf(err: Error): number | null {
  const frame = FRAME.exec(err.stack ?? '');
  const offset = wrapperLines();
  if (!frame || offset == null) return null;
  const line = Number(frame[1]) - offset;
  return line >= 1 ? line : null;
}

let measured: number | null | undefined;

/**
 * Engines count the lines of the function wrapper that `new Function` puts
 * around the code — how many differs between them, so it is measured once with
 * an error thrown from a known line rather than assumed.
 */
function wrapperLines(): number | null {
  if (measured !== undefined) return measured;
  try {
    run('throw new Error()', { exports: {} });
    measured = null;
  } catch (probe) {
    const frame = FRAME.exec((probe as Error).stack ?? '');
    measured = frame ? Number(frame[1]) - 1 : null;
  }
  return measured;
}
