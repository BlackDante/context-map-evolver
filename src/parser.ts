import type {
  Connascence,
  Context,
  ContextMap,
  Cynefin,
  PromiseDecl,
  Relation,
  Subdomain,
  ConnascenceKind,
} from './model';
import { CONNASCENCE_META, CYNEFIN_META, SUBDOMAIN_META } from './model';

export interface ParseResult {
  map: ContextMap;
  /**
   * Human-readable problems, each prefixed with `line N:`. Parsing never throws
   * and never gives up: everything that could be understood is still in `map`,
   * so the diagram keeps rendering while the user is mid-edit.
   */
  errors: string[];
}

type Tok =
  | { t: 'word'; v: string; line: number }
  | { t: 'string'; v: string; line: number }
  | { t: 'arrow'; line: number }
  | { t: 'lbrace'; line: number }
  | { t: 'rbrace'; line: number };

const NUMBER = /^-?\d+(\.\d+)?$/;
const RELATION_KEYWORDS = new Set(['type', 'upstream', 'downstream', 'integration', 'coupling', 'connascence']);

// --- tokenizer --------------------------------------------------------------

function tokenize(src: string, errors: string[]): Tok[] {
  const toks: Tok[] = [];
  const lines = src.split('\n');
  for (let ln = 0; ln < lines.length; ln++) {
    const line = ln + 1;
    // strip line comments (# or //) — but not inside a quoted string
    const s = stripComment(lines[ln]);
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ' || c === '\t' || c === '\r') {
        i++;
        continue;
      }
      if (c === '"') {
        // strings are single-line and have no escape sequences
        const end = s.indexOf('"', i + 1);
        if (end === -1) {
          errors.push(`line ${line}: unterminated string — missing closing '"'`);
          toks.push({ t: 'string', v: s.slice(i + 1).trimEnd(), line });
          break;
        }
        toks.push({ t: 'string', v: s.slice(i + 1, end), line });
        i = end + 1;
        continue;
      }
      if (c === '{') {
        toks.push({ t: 'lbrace', line });
        i++;
        continue;
      }
      if (c === '}') {
        toks.push({ t: 'rbrace', line });
        i++;
        continue;
      }
      if (c === '-' && s[i + 1] === '>') {
        toks.push({ t: 'arrow', line });
        i += 2;
        continue;
      }
      // bare word — may contain hyphens (customer-supplier) but stops at `->`
      let j = i;
      while (j < s.length && !' \t\r{}"'.includes(s[j]) && !(s[j] === '-' && s[j + 1] === '>')) j++;
      toks.push({ t: 'word', v: s.slice(i, j), line });
      i = j;
    }
  }
  return toks;
}

function stripComment(s: string): string {
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') inStr = !inStr;
    if (!inStr && (s[i] === '#' || (s[i] === '/' && s[i + 1] === '/'))) {
      return s.slice(0, i);
    }
  }
  return s;
}

// --- parser -----------------------------------------------------------------

export function parse(src: string): ParseResult {
  const errors: string[] = [];
  const toks = tokenize(src, errors);
  const map: ContextMap = { title: 'Untitled map', contexts: [], relations: [] };
  // source lines for the post-parse reference checks (the model itself stays
  // free of position info)
  const contextLine = new Map<string, number>();
  const relationLine = new Map<Relation, number>();
  const promiseLine = new Map<PromiseDecl, number>();
  let p = 0;

  const peek = (): Tok | undefined => toks[p];
  const next = (): Tok => toks[p++];

  while (p < toks.length) {
    const tok = next();
    if (tok.t === 'word' && tok.v === 'map') {
      const title = str();
      if (title != null) map.title = title;
      else errors.push(`line ${tok.line}: 'map' expects a quoted title`);
      continue;
    }
    if (tok.t === 'word' && tok.v === 'context') {
      parseContext(tok.line);
      continue;
    }
    // relation:  NAME  ->  NAME  [ { ... } ]
    if (tok.t === 'word' || tok.t === 'string') {
      if (peek()?.t === 'arrow') {
        next();
        const target = name();
        if (target != null) parseRelation(tok.v, target, tok.line);
        else errors.push(`line ${tok.line}: relation target expected after '->'`);
        continue;
      }
      errors.push(`line ${tok.line}: unexpected '${tok.v}' — expected 'map', 'context' or a relation 'A -> B'`);
      continue;
    }
    errors.push(`line ${tok.line}: unexpected '${symbol(tok)}'`);
  }

  validateReferences();
  return { map, errors };

  // ---- block helpers -------------------------------------------------------

  function parseContext(line: number) {
    const ctxName = name();
    if (ctxName == null) {
      errors.push(`line ${line}: 'context' expects a name`);
      return;
    }
    const ctx: Context = { name: ctxName, questions: [], promises: [] };
    parseBlock(`context '${ctxName}'`, () => parseContextProp(ctx));
    const firstLine = contextLine.get(ctxName);
    if (firstLine != null) {
      // two boxes with one name would be indistinguishable to every relation
      errors.push(`line ${line}: duplicate context '${ctxName}' (first declared on line ${firstLine}) — ignored`);
      return;
    }
    contextLine.set(ctxName, line);
    map.contexts.push(ctx);
  }

  function parseRelation(source: string, target: string, line: number) {
    const rel: Relation = { source, target, connascence: [] };
    parseBlock(`relation ${source} -> ${target}`, () => parseRelationProp(rel));
    relationLine.set(rel, line);
    map.relations.push(rel);
  }

  /** Optional `{ prop … }` body. Recovers from a forgotten `}`. */
  function parseBlock(what: string, parseProp: () => void) {
    const open = peek();
    if (open?.t !== 'lbrace') return;
    next();
    for (;;) {
      const tok = peek();
      if (!tok || startsTopLevel()) {
        errors.push(`line ${open.line}: ${what} is missing its closing '}'`);
        return;
      }
      if (tok.t === 'rbrace') {
        next();
        return;
      }
      parseProp();
    }
  }

  /**
   * Inside a block, `context …` or `X -> …` can only mean the closing brace was
   * forgotten. Bailing out here keeps one typo from swallowing the rest of the
   * model into a single broken block.
   */
  function startsTopLevel(): boolean {
    const tok = peek();
    if (tok?.t === 'word' && (tok.v === 'context' || tok.v === 'map')) return true;
    return (tok?.t === 'word' || tok?.t === 'string') && toks[p + 1]?.t === 'arrow';
  }

  function parseContextProp(ctx: Context) {
    const kw = next();
    if (kw.t !== 'word') {
      errors.push(`line ${kw.line}: expected a property keyword in context '${ctx.name}', got '${symbol(kw)}'`);
      return;
    }
    switch (kw.v) {
      case 'subdomain': {
        const v = word();
        if (v != null && has(SUBDOMAIN_META, v)) ctx.subdomain = v as Subdomain;
        else errors.push(`line ${kw.line}: subdomain must be ${Object.keys(SUBDOMAIN_META).join(' | ')}`);
        break;
      }
      case 'cynefin': {
        const v = word();
        if (v != null && has(CYNEFIN_META, v)) ctx.cynefin = v as Cynefin;
        else errors.push(`line ${kw.line}: cynefin must be ${Object.keys(CYNEFIN_META).join(' | ')}`);
        break;
      }
      case 'question': {
        const v = str();
        if (v != null) ctx.questions.push(v);
        else errors.push(`line ${kw.line}: 'question' expects a quoted string`);
        break;
      }
      case 'promise':
      case 'imposition': {
        // optional Burgess polarity sign: + (give/offer) or - (use/accept)
        let polarity: '+' | '-' = '+';
        const sign = peek();
        if (sign?.t === 'word' && (sign.v === '+' || sign.v === '-')) {
          polarity = sign.v;
          next();
        }
        const body = str();
        // optional direction word: to | from | on, then the counterpart context
        let to: string | undefined;
        const dir = peek();
        if (dir?.t === 'word' && ['to', 'from', 'on'].includes(dir.v)) {
          next();
          to = name() ?? undefined;
          if (to == null) errors.push(`line ${dir.line}: '${dir.v}' expects a context name`);
        }
        // optional condition: if "..."
        let condition: string | undefined;
        const iff = peek();
        if (iff?.t === 'word' && iff.v === 'if') {
          next();
          condition = str() ?? undefined;
          if (condition == null) errors.push(`line ${iff.line}: 'if' expects a quoted condition`);
        }
        if (body == null) {
          errors.push(`line ${kw.line}: '${kw.v}' expects a quoted body, e.g. ${kw.v} "fresh prices" to Sales`);
          break;
        }
        const decl: PromiseDecl = { body, to, kind: kw.v, polarity, condition };
        promiseLine.set(decl, kw.line);
        ctx.promises.push(decl);
        break;
      }
      case 'at': {
        const x = number();
        const y = number();
        if (x != null && y != null) {
          ctx.x = x;
          ctx.y = y;
        } else {
          errors.push(`line ${kw.line}: 'at' expects two numbers, e.g. at 400 200`);
        }
        break;
      }
      default:
        errors.push(`line ${kw.line}: unknown context property '${kw.v}'`);
    }
  }

  function parseRelationProp(rel: Relation) {
    const kw = next();
    if (kw.t !== 'word') {
      errors.push(`line ${kw.line}: expected a property keyword in relation, got '${symbol(kw)}'`);
      return;
    }
    switch (kw.v) {
      case 'type':
      case 'upstream':
      case 'downstream': {
        // free-form labels; quote them to include spaces ("shared kernel")
        // a following keyword means the value was left out, not that it IS the value
        const nxt = peek();
        const v = nxt?.t === 'word' && RELATION_KEYWORDS.has(nxt.v) ? null : name();
        if (v == null) errors.push(`line ${kw.line}: '${kw.v}' expects a value`);
        else if (kw.v === 'type') rel.type = v;
        else if (kw.v === 'upstream') rel.upstreamRole = v;
        else rel.downstreamRole = v;
        break;
      }
      case 'integration': {
        const v = str();
        if (v != null) rel.integration = v;
        else errors.push(`line ${kw.line}: 'integration' expects a quoted string`);
        break;
      }
      case 'coupling': {
        const w = number();
        if (w != null && w > 0) rel.coupling = w;
        else errors.push(`line ${kw.line}: coupling expects a positive number`);
        break;
      }
      case 'connascence': {
        const kind = word();
        if (kind == null || !has(CONNASCENCE_META, kind)) {
          errors.push(
            `line ${kw.line}: unknown connascence kind '${kind ?? ''}' — expected ${Object.keys(CONNASCENCE_META).join(' | ')}`
          );
          break;
        }
        const con: Connascence = { kind: kind as ConnascenceKind };
        // optional: locality + degree in any order
        for (;;) {
          const t = peek();
          if (t?.t !== 'word') break;
          if (t.v === 'local' || t.v === 'distant') con.locality = t.v;
          else if (/^\d+$/.test(t.v)) con.degree = Number(t.v);
          else break;
          next();
        }
        rel.connascence.push(con); // a relation may list several kinds
        break;
      }
      default:
        errors.push(`line ${kw.line}: unknown relation property '${kw.v}'`);
    }
  }

  /** Everything that names a context must name one that exists. */
  function validateReferences() {
    const known = new Set(map.contexts.map((c) => c.name));
    for (const r of map.relations) {
      const line = relationLine.get(r);
      for (const end of new Set([r.source, r.target])) {
        if (!known.has(end)) errors.push(`line ${line}: relation references unknown context '${end}'`);
      }
      if (r.source === r.target) errors.push(`line ${line}: '${r.source}' cannot have a relation with itself`);
    }
    for (const c of map.contexts) {
      for (const pr of c.promises) {
        if (pr.to == null) continue;
        const line = promiseLine.get(pr);
        if (!known.has(pr.to)) errors.push(`line ${line}: ${pr.kind} references unknown context '${pr.to}'`);
        else if (pr.to === c.name) errors.push(`line ${line}: '${c.name}' cannot make a ${pr.kind} to itself`);
      }
    }
  }

  // ---- token helpers: each consumes the next token only if it matches --------

  function word(): string | null {
    const t = peek();
    if (t?.t !== 'word') return null;
    next();
    return t.v;
  }
  function str(): string | null {
    const t = peek();
    if (t?.t !== 'string') return null;
    next();
    return t.v;
  }
  /** A bare word or a quoted string — anywhere a name with spaces may appear. */
  function name(): string | null {
    return word() ?? str();
  }
  function number(): number | null {
    const t = peek();
    if (t?.t !== 'word' || !NUMBER.test(t.v)) return null;
    next();
    return Number(t.v);
  }
}

/** Own-key check — `in` would also accept `constructor`, `toString`, … */
function has(table: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(table, key);
}

function symbol(tok: Tok): string {
  switch (tok.t) {
    case 'arrow':
      return '->';
    case 'lbrace':
      return '{';
    case 'rbrace':
      return '}';
    case 'string':
      return `"${tok.v}"`;
    default:
      return tok.v;
  }
}
