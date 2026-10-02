import { describe, expect, it } from 'vitest';
import { resolveFlags } from '../src/flags';

describe('feature flags', () => {
  it('ships unfinished features dark by default', () => {
    expect(resolveFlags(undefined, '')).toEqual({ analysis: false, typescript: false });
    expect(resolveFlags('', '?level=3')).toEqual({ analysis: false, typescript: false });
  });

  it('can be switched on at build time', () => {
    expect(resolveFlags('analysis', '').analysis).toBe(true);
    expect(resolveFlags(' other , analysis ', '').analysis).toBe(true);
  });

  it('can be switched on per visit from the URL', () => {
    expect(resolveFlags(undefined, '?features=analysis').analysis).toBe(true);
    expect(resolveFlags(undefined, '?x=1&features=foo,analysis').analysis).toBe(true);
  });

  it('lets the URL override the build, in both directions', () => {
    expect(resolveFlags('analysis', '?features=-analysis').analysis).toBe(false);
    expect(resolveFlags('-analysis', '?features=analysis').analysis).toBe(true);
  });

  it('ignores unknown and inherited names instead of failing', () => {
    expect(resolveFlags('constructor,nope', '?features=toString,__proto__')).toEqual({ analysis: false, typescript: false });
  });

  it('switches flags independently, several at once', () => {
    expect(resolveFlags(undefined, '?features=typescript')).toEqual({ analysis: false, typescript: true });
    expect(resolveFlags('typescript', '?features=analysis')).toEqual({ analysis: true, typescript: true });
    expect(resolveFlags('analysis,typescript', '?features=-typescript')).toEqual({ analysis: true, typescript: false });
  });
});
