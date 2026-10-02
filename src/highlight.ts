// Tiny tokenizing highlighter for the .cme DSL and for TypeScript map files.
// Returns HTML (escaped) with <span class="hl-*"> wrappers, designed to sit in
// a <pre> layered exactly behind a transparent <textarea>, so the caret stays
// native while the text shows colour.

import { esc } from './escape';
import type { Lang } from './language';

const KEYWORDS = new Set([
  'map', 'context', 'subdomain', 'cynefin', 'question', 'promise', 'imposition',
  'at', 'type', 'upstream', 'downstream', 'integration', 'coupling', 'connascence',
  'to', 'from', 'on', 'if',
]);

const VALUES = new Set([
  // subdomain
  'core', 'supporting', 'generic',
  // cynefin
  'clear', 'complicated', 'complex', 'chaotic', 'disorder',
  // connascence kinds
  'name', 'meaning', 'position', 'algorithm', 'execution', 'timing', 'value', 'identity',
  // locality
  'local', 'distant',
]);

// Order matters: comment, string, arrow, brace, number, word.
// The word rule allows internal hyphens (customer-supplier) but NOT a hyphen
// that begins an arrow, so `A->B` still tokenises the arrow correctly.
const TOKEN =
  /(#[^\n]*|\/\/[^\n]*)|("[^"\n]*"?)|(->)|([{}])|(\b\d+\b)|([A-Za-z_](?:[A-Za-z0-9_]|-(?!>))*)|([+-])/g;

// --- TypeScript ---------------------------------------------------------------

const TS_KEYWORDS = new Set([
  'import', 'from', 'export', 'default', 'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'of',
  'in', 'while', 'new', 'type', 'interface', 'as', 'satisfies', 'true', 'false', 'null', 'undefined',
]);

// the builder vocabulary (src/builder.ts) — coloured like the DSL's values so a map still reads as a map
const TS_API = new Set(['context', 'map', 'promises', 'uses', 'imposes', 'upstreamOf', 'connascence', 'to', 'on']);

// Order matters: comment, string, number, word, punctuation. Strings honour
// backslash escapes; a quote left open ends at the line break (a template
// literal at the end of the text), as it would while still being typed.
const TS_TOKEN =
  /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\[\s\S])*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([{}()[\];,.])/g;

export function highlight(src: string, lang: Lang = 'dsl'): string {
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  const token = lang === 'ts' ? TS_TOKEN : TOKEN;
  token.lastIndex = 0;
  while ((m = token.exec(src)) !== null) {
    if (m.index > last) out += esc(src.slice(last, m.index));
    out += lang === 'ts' ? tsSpan(m) : dslSpan(m);
    last = m.index + m[0].length;
  }
  out += esc(src.slice(last));
  // keep a trailing blank line tall so the caret on an empty last line aligns
  if (src.endsWith('\n')) out += '\n';
  return out;
}

function dslSpan(m: RegExpExecArray): string {
  const [full, comment, str, arrow, brace, num, word] = m;
  if (comment != null) return span('cm', full);
  if (str != null) return span('st', full);
  if (arrow != null) return span('op', full);
  if (brace != null) return span('pn', full);
  if (num != null) return span('nu', full);
  if (word != null) return span(KEYWORDS.has(word) ? 'kw' : VALUES.has(word) ? 'va' : 'id', full);
  return span('po', full); // the polarity sign
}

function tsSpan(m: RegExpExecArray): string {
  const [full, comment, str, num, word] = m;
  if (comment != null) return span('cm', full);
  if (str != null) return span('st', full);
  if (num != null) return span('nu', full);
  if (word != null) return span(TS_KEYWORDS.has(word) ? 'kw' : TS_API.has(word) ? 'va' : 'id', full);
  return span('pn', full);
}

function span(cls: string, text: string): string {
  return `<span class="hl-${cls}">${esc(text)}</span>`;
}
