// Tiny tokenizing highlighter for the .cme DSL. Returns HTML (escaped) with
// <span class="hl-*"> wrappers, designed to sit in a <pre> layered exactly
// behind a transparent <textarea>, so the caret stays native while the text
// shows colour.

import { esc } from './escape';

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

export function highlight(src: string): string {
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(src)) !== null) {
    if (m.index > last) out += esc(src.slice(last, m.index));
    const [full, comment, str, arrow, brace, num, word, polarity] = m;
    if (comment != null) out += span('cm', full);
    else if (str != null) out += span('st', full);
    else if (arrow != null) out += span('op', full);
    else if (brace != null) out += span('pn', full);
    else if (num != null) out += span('nu', full);
    else if (word != null) out += span(KEYWORDS.has(word) ? 'kw' : VALUES.has(word) ? 'va' : 'id', full);
    else if (polarity != null) out += span('po', full);
    last = m.index + full.length;
  }
  out += esc(src.slice(last));
  // keep a trailing blank line tall so the caret on an empty last line aligns
  if (src.endsWith('\n')) out += '\n';
  return out;
}

function span(cls: string, text: string): string {
  return `<span class="hl-${cls}">${esc(text)}</span>`;
}
