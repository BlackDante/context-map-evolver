import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { highlight } from '../src/highlight';
import { DEMOS } from '../src/demos';
import type { Lang } from '../src/language';

/** The highlighter output with its markup removed and entities decoded. */
const plain = (html: string) =>
  html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const classes = (src: string, lang: Lang = 'dsl') =>
  [...highlight(src, lang).matchAll(/<span class="hl-(\w+)">([^<]*)<\/span>/g)].map((m) => `${m[1]}:${m[2]}`);

describe('highlight', () => {
  it.each(DEMOS.map((d) => [d.name, d.dsl] as const))(
    '%s: the overlay text is character-for-character the editor text',
    (_n, dsl) => {
      // the <pre> sits exactly behind the <textarea>; any drift misaligns the caret
      // (plus the one deliberate extra newline that gives a trailing empty line its height)
      expect(plain(highlight(dsl))).toBe(dsl + '\n');
    }
  );

  it('classifies each token kind', () => {
    expect(classes('context Legal { subdomain core } # note')).toEqual([
      'kw:context',
      'id:Legal',
      'pn:{',
      'kw:subdomain',
      'va:core',
      'pn:}',
      'cm:# note',
    ]);
  });

  it('keeps hyphenated words whole but still sees the arrow in A->B', () => {
    expect(classes('A->B { type customer-supplier }')).toEqual([
      'id:A',
      'op:-&gt;',
      'id:B',
      'pn:{',
      'kw:type',
      'id:customer-supplier',
      'pn:}',
    ]);
  });

  it('marks polarity signs and numbers', () => {
    expect(classes('promise - "x"  at 10 20')).toEqual(['kw:promise', 'po:-', 'st:"x"', 'kw:at', 'nu:10', 'nu:20']);
  });

  it('does not highlight keywords or comment markers inside strings', () => {
    expect(classes('question "context # not a comment"')).toEqual(['kw:question', 'st:"context # not a comment"']);
  });

  it('ends a string at the closing quote, like the parser (no escape sequences)', () => {
    expect(classes('question "a\\" context')).toEqual(['kw:question', 'st:"a\\"', 'kw:context']);
  });

  it('colours an unterminated string to the end of its line only', () => {
    expect(classes('map "oops\ncontext A')).toEqual(['kw:map', 'st:"oops', 'kw:context', 'id:A']);
  });

  it('escapes markup', () => {
    expect(highlight('context <b>')).not.toContain('<b>');
  });

  it('adds a line after a trailing newline so the caret row has height', () => {
    expect(highlight('context A\n').endsWith('\n\n')).toBe(true);
  });
});

describe('highlight — TypeScript', () => {
  const ts = (src: string) => classes(src, 'ts');
  const examples = new URL('../examples/', import.meta.url);

  it.each(readdirSync(examples).filter((f) => f.endsWith('.cme.ts')))(
    '%s: the overlay text is character-for-character the editor text',
    (file) => {
      const src = readFileSync(new URL(file, examples), 'utf8');
      expect(plain(highlight(src, 'ts'))).toBe(src + '\n');
    }
  );

  it('classifies each token kind', () => {
    expect(ts(`const legal = context('Legal', { at: [40, 2.5] }); // hub`)).toEqual([
      'kw:const',
      'id:legal',
      'va:context',
      'pn:(',
      "st:'Legal'",
      'pn:,',
      'pn:{',
      'id:at',
      'pn:[',
      'nu:40',
      'pn:,',
      'nu:2.5',
      'pn:]',
      'pn:}',
      'pn:)',
      'pn:;',
      'cm:// hub',
    ]);
  });

  it('colours the builder vocabulary apart from ordinary identifiers', () => {
    expect(ts('a.upstreamOf(b).connascence(x)').filter((c) => c.startsWith('va:'))).toEqual(['va:upstreamOf', 'va:connascence']);
    expect(ts(`import { context, map } from 'context-map-evolver'`)).toEqual([
      'kw:import',
      'pn:{',
      'va:context',
      'pn:,',
      'va:map',
      'pn:}',
      'kw:from',
      "st:'context-map-evolver'",
    ]);
  });

  it('reads all three kinds of string, escapes included', () => {
    expect(ts(`'it\\'s' "say \\"hi\\"" \`a 'b' \${c}\``)).toEqual([`st:'it\\'s'`, 'st:"say \\"hi\\""', "st:`a 'b' ${c}`"]);
  });

  it('does not highlight keywords or comment markers inside strings', () => {
    expect(ts(`'const // x'`)).toEqual([`st:'const // x'`]);
  });

  it('colours an unterminated string to the end of its line only', () => {
    expect(ts(`context('oops\nconst a`)).toEqual(['va:context', 'pn:(', "st:'oops", 'kw:const', 'id:a']);
  });

  it('reads block comments, also one that is still being typed', () => {
    expect(ts('/* a\n b */ const')).toEqual(['cm:/* a\n b */', 'kw:const']);
    expect(ts('const /* open\nconst')).toEqual(['kw:const', 'cm:/* open\nconst']);
  });

  it('does not apply DSL rules to TypeScript, or the other way round', () => {
    expect(ts('# not a comment')).toEqual(['id:not', 'id:a', 'id:comment']);
    expect(classes(`'x' context`)).toEqual(['id:x', 'kw:context']);
  });

  it('escapes markup', () => {
    expect(highlight('const a = <b>', 'ts')).not.toContain('<b>');
  });
});
