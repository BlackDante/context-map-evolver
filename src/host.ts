// Client side of `context-map-evolver host`: when the page is served by the CLI
// it carries a <meta name="cme-host"> tag pointing at a small read-only API
// (see cli/host.ts). On a static deploy the tag is absent and none of this runs.

export interface HostedFile {
  /** Path relative to the hosted directory, forward slashes. */
  path: string;
  /** Display name — the path without its .cme extension. */
  name: string;
}

export interface HostedIndex {
  /** Basename of the hosted directory, for labelling. */
  dir: string;
  files: HostedFile[];
}

/** The API base when hosted by the CLI, or null on a static deploy. */
export function hostApiFrom(doc: Document): string | null {
  const content = doc.querySelector('meta[name="cme-host"]')?.getAttribute('content')?.trim();
  return content ? content.replace(/\/+$/, '') : null;
}

/** URL of one file's DSL text; each path segment is encoded on its own so `/` survives. */
export function fileUrl(api: string, filePath: string): string {
  return `${api}/files/${filePath.split('/').map(encodeURIComponent).join('/')}`;
}

/** Which file to open first: the one named by `?file=` when it exists, else the first one. */
export function initialFile(files: HostedFile[], search: string): HostedFile | undefined {
  const wanted = new URLSearchParams(search).get('file');
  return files.find((f) => f.path === wanted) ?? files[0];
}

/**
 * Picker values distinguish hosted files from built-in demos so both can share
 * one <select>: "file:billing/payments.cme" vs "demo:classic".
 */
export type Source = { kind: 'file'; path: string } | { kind: 'demo'; id: string };

export function sourceValue(source: Source): string {
  return source.kind === 'file' ? `file:${source.path}` : `demo:${source.id}`;
}

export function parseSource(value: string): Source | null {
  if (value.startsWith('file:')) return { kind: 'file', path: value.slice(5) };
  if (value.startsWith('demo:')) return { kind: 'demo', id: value.slice(5) };
  return null;
}
