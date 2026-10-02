// A model written back out as text, in either language — what the editor's
// DSL ⇄ TS switch runs. Both directions go through the ContextMap, so they carry
// everything the model holds and nothing it does not: comments and formatting
// stay behind.
import type { Connascence, Context, ContextMap, PromiseDecl, Relation } from './model';
import type { Lang } from './language';

export function toText(map: ContextMap, lang: Lang): string {
  return lang === 'ts' ? toTs(map) : toDsl(map);
}

// ---- DSL ---------------------------------------------------------------------

export function toDsl(map: ContextMap): string {
  const blocks: string[] = [`map ${dslString(map.title)}`];
  for (const c of map.contexts) blocks.push(dslBlock(`context ${dslName(c.name)}`, contextProps(c)));
  if (map.relations.length) {
    blocks.push(map.relations.map((r) => dslBlock(`${dslName(r.source)} -> ${dslName(r.target)}`, relationProps(r))).join('\n'));
  }
  return blocks.join('\n\n') + '\n';
}

function contextProps(c: Context): string[] {
  const props: string[] = [];
  if (c.x != null && c.y != null) props.push(`at ${c.x} ${c.y}`);
  if (c.subdomain) props.push(`subdomain ${c.subdomain}`);
  if (c.cynefin) props.push(`cynefin ${c.cynefin}`);
  for (const q of c.questions) props.push(`question ${dslString(q)}`);
  for (const p of c.promises) props.push(dslPromise(p));
  return props;
}

function dslPromise(p: PromiseDecl): string {
  const imposed = p.kind === 'imposition';
  let line = imposed ? `imposition ${p.polarity === '-' ? '- ' : ''}` : `promise ${p.polarity} `;
  line += dslString(p.body);
  if (p.to != null) line += ` ${imposed ? 'on' : p.polarity === '-' ? 'from' : 'to'} ${dslName(p.to)}`;
  if (p.condition != null) line += ` if ${dslString(p.condition)}`;
  return line;
}

function relationProps(r: Relation): string[] {
  const props: string[] = [];
  if (r.type != null) props.push(`type ${dslName(r.type)}`);
  if (r.upstreamRole != null) props.push(`upstream ${dslName(r.upstreamRole)}`);
  if (r.downstreamRole != null) props.push(`downstream ${dslName(r.downstreamRole)}`);
  if (r.integration != null) props.push(`integration ${dslString(r.integration)}`);
  if (r.coupling != null) props.push(`coupling ${r.coupling}`);
  for (const c of r.connascence) props.push(['connascence', c.kind, c.locality, c.degree].filter((part) => part != null).join(' '));
  return props;
}

function dslBlock(head: string, props: string[]): string {
  if (!props.length) return head;
  if (props.length === 1) return `${head} { ${props[0]} }`;
  return `${head} {\n${props.map((p) => `  ${p}`).join('\n')}\n}`;
}

/** DSL strings are single-line and have no escapes: a `"` or a line break inside cannot be written. */
function dslString(s: string): string {
  return `"${s.replace(/"/g, "'").replace(/\s*\n\s*/g, ' ')}"`;
}

// every word the parser gives a meaning to somewhere — quoted when used as a name, to be safe in any position
const DSL_WORDS = new Set([
  'map', 'context', 'subdomain', 'cynefin', 'question', 'promise', 'imposition', 'at',
  'type', 'upstream', 'downstream', 'integration', 'coupling', 'connascence', 'to', 'from', 'on', 'if',
]);

/** A bare word where the tokenizer would read it back as one word, a string otherwise. */
function dslName(name: string): string {
  const bare = /^[\p{L}\p{N}_][\p{L}\p{N}_.+&-]*$/u.test(name) && !name.includes('->') && !DSL_WORDS.has(name);
  return bare ? name : dslString(name);
}

// ---- TypeScript --------------------------------------------------------------

export function toTs(map: ContextMap): string {
  const vars = variableNames(map);
  const v = (name: string) => vars.get(name)!;
  const onMap = new Set(map.contexts.map((c) => c.name));
  const lines: string[] = [`import { context, map } from 'context-map-evolver';`, ''];

  const contexts = map.contexts.map((c) => {
    const lead = `const ${v(c.name)} = `;
    return `${lead}${call('context', [tsString(c.name)], contextOptions(c), lead.length + 1)};`;
  });
  // a model can name contexts it never declares (the parser reports them); they
  // still need a variable to be named with, but stay off the map
  const undeclared = [...vars.keys()].filter((name) => !onMap.has(name));
  contexts.push(...undeclared.map((name) => `const ${v(name)} = context(${tsString(name)}); // not on the map`));

  const promises = map.contexts.flatMap((c) => c.promises.map((p) => tsPromise(v(c.name), p, v)));
  const relations = map.relations.map((r) => tsRelation(r, v));
  for (const group of [contexts, promises, relations]) if (group.length) lines.push(stack(group), '');

  const lead = 'export default ';
  lines.push(`${lead}${call('map', [tsString(map.title), ...map.contexts.map((c) => v(c.name))], [], lead.length + 1)};`);
  return lines.join('\n') + '\n';
}

/** Statements one per line, with a blank line setting apart those that span several. */
function stack(statements: string[]): string {
  return statements
    .map((st, i) => (i > 0 && (st.includes('\n') || statements[i - 1].includes('\n')) ? `\n${st}` : st))
    .join('\n');
}

function contextOptions(c: Context): string[] {
  const props: string[] = [];
  if (c.x != null && c.y != null) props.push(`at: [${c.x}, ${c.y}]`);
  if (c.subdomain) props.push(`subdomain: ${tsString(c.subdomain)}`);
  if (c.cynefin) props.push(`cynefin: ${tsString(c.cynefin)}`);
  if (c.questions.length) props.push(`questions: ${list(c.questions.map(tsString), '  ')}`);
  return props;
}

function tsPromise(owner: string, p: PromiseDecl, v: (name: string) => string): string {
  // the builder has no "use-imposition": the polarity of an imposition is never drawn, so it is not carried over
  const [verb, direction] = p.kind === 'imposition' ? ['imposes', 'on'] : p.polarity === '-' ? ['uses', 'from'] : ['promises', 'to'];
  let line = `${owner}.${verb}(${tsString(p.body)})`;
  if (p.to != null) line += `.${direction}(${v(p.to)})`;
  if (p.condition != null) line += `.if(${tsString(p.condition)})`;
  return `${line};`;
}

function tsRelation(r: Relation, v: (name: string) => string): string {
  const options: string[] = [];
  if (r.type != null) options.push(`type: ${tsString(r.type)}`);
  if (r.upstreamRole != null) options.push(`upstream: ${tsString(r.upstreamRole)}`);
  if (r.downstreamRole != null) options.push(`downstream: ${tsString(r.downstreamRole)}`);
  if (r.integration != null) options.push(`integration: ${tsString(r.integration)}`);
  if (r.coupling != null) options.push(`coupling: ${r.coupling}`);
  const head = call(`${v(r.source)}.upstreamOf`, [v(r.target)], options, 1);
  const chain = r.connascence.map(tsConnascence);
  if (!chain.length) return `${head};`;
  // one kind stays on the line when it fits; several read better stacked
  const lastLine = head.slice(head.lastIndexOf('\n') + 1);
  if (chain.length === 1 && lastLine.length + chain[0].length < WIDTH) return `${head}${chain[0]};`;
  return `${head}\n${chain.map((c) => `  ${c}`).join('\n')};`;
}

function tsConnascence(c: Connascence): string {
  const args = [tsString(c.kind), c.locality && tsString(c.locality), c.degree].filter((arg) => arg != null);
  return `.connascence(${args.join(', ')})`;
}

const WIDTH = 80;

/**
 * `fn(args, { options })` — the options object on one line when it fits, one
 * property per line when not. `around` is what else shares the line: the
 * `const x = ` in front, the `;` behind.
 */
function call(fn: string, args: string[], options: string[] = [], around = 0): string {
  const width = WIDTH - around;
  if (!options.length) {
    const flat = `${fn}(${args.join(', ')})`;
    return flat.length <= width ? flat : `${fn}(\n${args.map((a) => `  ${a},`).join('\n')}\n)`;
  }
  const flat = `${fn}(${[...args, `{ ${options.join(', ')} }`].join(', ')})`;
  if (flat.length <= width && !flat.includes('\n')) return flat;
  return `${fn}(${[...args, `{\n${options.map((o) => `  ${o},`).join('\n')}\n}`].join(', ')})`;
}

function list(items: string[], indent: string): string {
  const flat = `[${items.join(', ')}]`;
  return flat.length <= 60 ? flat : `[\n${items.map((item) => `${indent}  ${item},`).join('\n')}\n${indent}]`;
}

function tsString(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
}

// names a generated file cannot use for a context variable
const TS_RESERVED = new Set([
  'context', 'map', // the two imports
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum',
  'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'null',
  'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with',
  'let', 'static', 'yield', 'await', 'implements', 'interface', 'package', 'private', 'protected', 'public',
  'arguments', 'eval', 'undefined',
]);

/** A unique identifier per context name: "Order Management" → orderManagement, "3PL" → _3pl. */
function variableNames(map: ContextMap): Map<string, string> {
  const names = [
    ...map.contexts.map((c) => c.name),
    ...map.relations.flatMap((r) => [r.source, r.target]),
    ...map.contexts.flatMap((c) => c.promises.flatMap((p) => (p.to != null ? [p.to] : []))),
  ];
  const vars = new Map<string, string>();
  const taken = new Set<string>();
  for (const name of names) {
    if (vars.has(name)) continue;
    const base = identifier(name);
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}${n}`;
    taken.add(id);
    vars.set(name, id);
  }
  return vars;
}

function identifier(name: string): string {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  const id = words
    .map((word, i) => {
      // an acronym is one unit: "API Gateway" → apiGateway, not aPIGateway
      const w = word === word.toUpperCase() ? word.toLowerCase() : word;
      return i === 0 ? w[0].toLowerCase() + w.slice(1) : w[0].toUpperCase() + w.slice(1);
    })
    .join('');
  if (!id) return 'ctx';
  if (/^\p{N}/u.test(id)) return `_${id}`;
  return TS_RESERVED.has(id) ? `${id}Context` : id;
}
