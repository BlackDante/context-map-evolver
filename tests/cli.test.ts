import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isCme, listCmeFiles, resolveCme } from '../cli/files';
import { appUrl, CONTENT_SECURITY_POLICY, createHostServer, META_TAG, type HostServer } from '../cli/host';
import { DEFAULT_PORT, UsageError, parseArgs } from '../cli/args';
import { browserCommand } from '../cli/open';

let root: string; // the hosted directory
let appDir: string; // a stand-in for dist/
let hosted: HostServer;
let base: string;

beforeAll(async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'cme-host-'));
  root = path.join(tmp, 'models');
  appDir = path.join(tmp, 'app');
  await mkdir(path.join(root, 'billing'), { recursive: true });
  await mkdir(path.join(root, 'node_modules', 'x'), { recursive: true });
  await mkdir(path.join(root, '.git'), { recursive: true });
  await mkdir(path.join(appDir, 'assets'), { recursive: true });
  await writeFile(path.join(root, 'zeta.cme'), 'map "Zeta"\n');
  await writeFile(path.join(root, 'alpha.CME'), 'map "Alpha"\n');
  await writeFile(path.join(root, 'billing', 'payments.cme'), 'map "Payments"\ncontext Ledger {}\n');
  await writeFile(path.join(root, 'billing', 'payments.cme.ts'), "export default map('Payments');\n");
  await writeFile(path.join(root, 'billing', 'ledger.ts'), 'export const notAMap = 1;\n');
  await writeFile(path.join(root, 'notes.txt'), 'not a model');
  await writeFile(path.join(root, 'node_modules', 'x', 'dep.cme'), 'map "hidden"\n');
  await writeFile(path.join(root, '.git', 'stash.cme'), 'map "hidden"\n');
  await writeFile(path.join(tmp, 'secret.cme'), 'map "outside"\n');
  await writeFile(path.join(appDir, 'index.html'), '<html><head><title>t</title></head><body></body></html>');
  await writeFile(path.join(appDir, 'assets', 'app.js'), 'console.log(1)');

  hosted = createHostServer({ root, appDir, watch: false });
  await new Promise<void>((resolve) => hosted.server.listen(0, '127.0.0.1', resolve));
  const address = hosted.server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(async () => {
  await hosted.close();
  await rm(path.dirname(root), { recursive: true, force: true });
});

describe('listing model files', () => {
  it('finds files recursively, case-insensitively, sorted by path', async () => {
    const files = await listCmeFiles(root);
    expect(files.map((f) => f.path)).toEqual(['alpha.CME', 'billing/payments.cme', 'billing/payments.cme.ts', 'zeta.cme']);
  });

  it('names a TypeScript model apart from the DSL one next to it', async () => {
    const files = await listCmeFiles(root);
    expect(files.map((f) => f.name)).toEqual(['alpha', 'billing/payments', 'billing/payments.ts', 'zeta']);
  });

  it('skips dot-directories, dependency trees and everything that is not a model', async () => {
    const paths = (await listCmeFiles(root)).map((f) => f.path);
    expect(paths.some((p) => p.includes('node_modules') || p.includes('.git') || p.endsWith('.txt'))).toBe(false);
    expect(paths).not.toContain('billing/ledger.ts'); // plain .ts is somebody's code, not a map
  });

  it('returns nothing for a directory that does not exist', async () => {
    expect(await listCmeFiles(path.join(root, 'missing'))).toEqual([]);
  });

  it('recognises the extension regardless of case', () => {
    expect(isCme('a.cme')).toBe(true);
    expect(isCme('a.CME')).toBe(true);
    expect(isCme('a.cme.bak')).toBe(false);
    expect(isCme('cme')).toBe(false);
  });

  it('recognises TypeScript models by their double extension only', () => {
    expect(isCme('a.cme.ts')).toBe(true);
    expect(isCme('a.CME.TS')).toBe(true);
    expect(isCme('a.ts')).toBe(false);
    expect(isCme('a.cme.tsx')).toBe(false);
    expect(isCme('a.cme.ts.swp')).toBe(false);
  });
});

describe('resolving a requested path', () => {
  it('resolves relative .cme paths inside the root', () => {
    expect(resolveCme(root, 'zeta.cme')).toBe(path.join(root, 'zeta.cme'));
    expect(resolveCme(root, 'billing/payments.cme')).toBe(path.join(root, 'billing', 'payments.cme'));
    expect(resolveCme(root, 'billing/payments.cme.ts')).toBe(path.join(root, 'billing', 'payments.cme.ts'));
  });

  it('refuses anything that escapes the root or is not a model', () => {
    expect(resolveCme(root, '../secret.cme')).toBeNull();
    expect(resolveCme(root, 'billing/../../secret.cme')).toBeNull();
    expect(resolveCme(root, path.join(root, '..', 'secret.cme'))).toBeNull(); // absolute
    expect(resolveCme(root, 'C:/models/x.cme')).toBeNull();
    expect(resolveCme(root, 'notes.txt')).toBeNull();
    expect(resolveCme(root, 'billing/ledger.ts')).toBeNull();
    expect(resolveCme(root, 'zeta.cme\0')).toBeNull();
    expect(resolveCme(root, '')).toBeNull();
    expect(resolveCme(root, '.cme')).not.toBeNull(); // odd, but inside and a .cme
  });
});

describe('host server', () => {
  it('serves the app and marks it as hosted', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const html = await res.text();
    expect(html).toContain(META_TAG);
    expect(html.indexOf(META_TAG)).toBeLessThan(html.indexOf('</head>'));
  });

  it('serves static assets with a content type and refuses to leave the app folder', async () => {
    const js = await fetch(`${base}/assets/app.js`);
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toContain('text/javascript');
    expect(await js.text()).toBe('console.log(1)');
    expect((await fetch(`${base}/assets/nope.js`)).status).toBe(404);
    expect((await fetch(`${base}/..%2F..%2Fmodels%2Fzeta.cme`)).status).toBe(404);
    expect((await fetch(`${base}/assets`)).status).toBe(404); // a directory
  });

  it('lists the hosted files as JSON', async () => {
    const res = await fetch(`${base}/api/files`);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body.dir).toBe('models');
    expect(body.root).toBe(root);
    expect(body.files.map((f: { path: string }) => f.path)).toEqual([
      'alpha.CME',
      'billing/payments.cme',
      'billing/payments.cme.ts',
      'zeta.cme',
    ]);
  });

  it('serves one file as plain text, nested paths included', async () => {
    const res = await fetch(`${base}/api/files/billing/payments.cme`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toBe('map "Payments"\ncontext Ledger {}\n');
  });

  it('serves a TypeScript model as text too — it is run by the browser, not here', async () => {
    const res = await fetch(`${base}/api/files/billing/payments.cme.ts`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toBe("export default map('Payments');\n");
    expect((await fetch(`${base}/api/files/billing/ledger.ts`)).status).toBe(404);
  });

  it('keeps what a model can reach on this machine', async () => {
    // a TypeScript model is code running on an origin that can read every hosted file
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self' 'unsafe-eval'");
    for (const url of ['/', '/assets/app.js', '/api/files', '/api/files/zeta.cme', '/assets/nope.js']) {
      expect((await fetch(`${base}${url}`)).headers.get('content-security-policy'), url).toBe(CONTENT_SECURITY_POLICY);
    }
  });

  it('answers 404 for missing files, traversal attempts and unknown endpoints', async () => {
    expect((await fetch(`${base}/api/files/missing.cme`)).status).toBe(404);
    expect((await fetch(`${base}/api/files/..%2Fsecret.cme`)).status).toBe(404);
    expect((await fetch(`${base}/api/files/notes.txt`)).status).toBe(404);
    expect((await fetch(`${base}/api/nope`)).status).toBe(404);
    expect((await fetch(`${base}/api/files/%E0%A4%A`)).status).toBe(400); // malformed escape
  });

  it('is read-only', async () => {
    const res = await fetch(`${base}/api/files/zeta.cme`, { method: 'PUT', body: 'x' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, HEAD');
  });

  it('streams change events to connected browsers', async () => {
    const res = await fetch(`${base}/api/events`);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    const reader = res.body!.getReader();
    let text = new TextDecoder().decode((await reader.read()).value); // the retry hint
    hosted.broadcast({ type: 'change', path: 'zeta.cme' });
    while (!text.includes('data:')) text += new TextDecoder().decode((await reader.read()).value);
    expect(text).toContain('retry: 1000');
    expect(text).toContain('data: {"type":"change","path":"zeta.cme"}\n\n');
    await reader.cancel();
  });
});

describe('command line', () => {
  it('defaults to hosting the current directory with the browser opening', () => {
    expect(parseArgs(['host'])).toEqual({ command: 'host', target: '.', port: undefined, open: true });
    expect(parseArgs(['host', 'docs'])).toEqual({ command: 'host', target: 'docs', port: undefined, open: true });
  });

  it('understands the options in every spelling', () => {
    expect(parseArgs(['host', 'x', '--port', '8080', '--no-open'])).toMatchObject({ port: 8080, open: false });
    expect(parseArgs(['host', '-p', '0', 'x'])).toMatchObject({ target: 'x', port: 0 });
    expect(parseArgs(['--port=9000', 'host'])).toMatchObject({ port: 9000 });
    expect(DEFAULT_PORT).toBeGreaterThan(1024);
  });

  it('shows help and version, help by default', () => {
    expect(parseArgs([])).toEqual({ command: 'help' });
    expect(parseArgs(['-h'])).toEqual({ command: 'help' });
    expect(parseArgs(['host', '--help'])).toEqual({ command: 'help' });
    expect(parseArgs(['--version'])).toEqual({ command: 'version' });
  });

  it('rejects what it does not understand with a usage error', () => {
    expect(() => parseArgs(['serve'])).toThrow(UsageError);
    expect(() => parseArgs(['host', 'a', 'b'])).toThrow(/unexpected argument 'b'/);
    expect(() => parseArgs(['host', '--verbose'])).toThrow(/unknown option/);
    expect(() => parseArgs(['host', '--port', 'abc'])).toThrow(/--port expects/);
    expect(() => parseArgs(['host', '--port', '70000'])).toThrow(/--port expects/);
    expect(() => parseArgs(['host', '--port'])).toThrow(/--port expects/);
  });

  it('opens the app on the hosted file, switching TypeScript on only when one was asked for', () => {
    expect(appUrl(5180)).toBe('http://localhost:5180/');
    expect(appUrl(5180, 'pay ments.cme')).toBe('http://localhost:5180/?file=pay%20ments.cme');
    expect(appUrl(5180, 'map.cme.ts')).toBe('http://localhost:5180/?file=map.cme.ts&features=typescript');
  });

  it('picks the right browser command per platform', () => {
    expect(browserCommand('http://x', 'darwin')).toEqual(['open', ['http://x']]);
    expect(browserCommand('http://x', 'win32')).toEqual(['cmd', ['/c', 'start', '', 'http://x']]);
    expect(browserCommand('http://x', 'linux')).toEqual(['xdg-open', ['http://x']]);
  });
});
