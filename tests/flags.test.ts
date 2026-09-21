import { describe, expect, it } from 'vitest';
import { resolveFlags } from '../src/flags';

describe('feature flags', () => {
  it('ships the analysis panel dark by default', () => {
    expect(resolveFlags(undefined, '')).toEqual({ analysis: false });
    expect(resolveFlags('', '?level=3')).toEqual({ analysis: false });
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
    expect(resolveFlags('constructor,nope', '?features=toString,__proto__')).toEqual({ analysis: false });
  });
});
