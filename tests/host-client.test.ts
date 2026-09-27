// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fileUrl, hostApiFrom, initialFile, parseSource, sourceValue } from '../src/host';

const page = (head: string) => new DOMParser().parseFromString(`<html><head>${head}</head><body></body></html>`, 'text/html');

describe('hosted-mode client', () => {
  it('reads the api base from the meta tag the CLI injects, and is off without it', () => {
    expect(hostApiFrom(page('<meta name="cme-host" content="/api">'))).toBe('/api');
    expect(hostApiFrom(page('<meta name="cme-host" content=" /api/ ">'))).toBe('/api');
    expect(hostApiFrom(page('<meta name="cme-host" content="">'))).toBeNull();
    expect(hostApiFrom(page('<meta name="description" content="x">'))).toBeNull();
  });

  it('builds file URLs that keep directory separators but encode everything else', () => {
    expect(fileUrl('/api', 'a.cme')).toBe('/api/files/a.cme');
    expect(fileUrl('/api', 'billing/pay ments#1.cme')).toBe('/api/files/billing/pay%20ments%231.cme');
  });

  it('opens the file named in the URL, falling back to the first one', () => {
    const files = [
      { path: 'a.cme', name: 'a' },
      { path: 'sub/b.cme', name: 'sub/b' },
    ];
    expect(initialFile(files, '?file=sub%2Fb.cme')?.path).toBe('sub/b.cme');
    expect(initialFile(files, '?file=missing.cme')?.path).toBe('a.cme');
    expect(initialFile(files, '')?.path).toBe('a.cme');
    expect(initialFile([], '?file=a.cme')).toBeUndefined();
  });

  it('round-trips picker values for files and demos', () => {
    expect(sourceValue({ kind: 'file', path: 'x/y.cme' })).toBe('file:x/y.cme');
    expect(sourceValue({ kind: 'demo', id: 'classic' })).toBe('demo:classic');
    expect(parseSource('file:x/y.cme')).toEqual({ kind: 'file', path: 'x/y.cme' });
    expect(parseSource('demo:classic')).toEqual({ kind: 'demo', id: 'classic' });
    expect(parseSource('classic')).toBeNull();
  });
});
