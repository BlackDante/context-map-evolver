import { describe, expect, it } from 'vitest';
import { highlight } from '../src/highlight';
import { DEMOS } from '../src/demos';

/** The highlighter output with its markup removed and entities decoded. */
const plain = (html: string) =>
  html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const classes = (src: string) =>
  [...highlight(src).matchAll(/<span class="hl-(\w+)">([^<]*)<\/span>/g)].map((m) => `${m[1]}:${m[2]}`);

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
