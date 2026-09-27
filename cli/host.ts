// The local server behind `context-map-evolver host`: serves the built app and
// exposes the hosted directory's .cme files over a tiny read-only API.
//
//   GET /                      the app; index.html gets a <meta name="cme-host">
//                              tag so the frontend knows it is being hosted
//   GET /api/files             { dir, root, files: [{ path, name }] }
//   GET /api/files/<path>      one file's DSL text
//   GET /api/events            server-sent events; `change` when a file changes
import http from 'node:http';
import path from 'node:path';
import { watch, type FSWatcher } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { isCme, listCmeFiles, resolveCme } from './files';

export interface HostOptions {
  /** Directory whose .cme files are offered to the app. */
  root: string;
  /** The built frontend (the `dist/` folder). */
  appDir: string;
  /** Watch `root` and push change events to connected browsers. Default: true. */
  watch?: boolean;
}

export interface HostServer {
  server: http.Server;
  /** Push an event to every connected browser. */
  broadcast(event: { type: string; path?: string }): void;
  close(): Promise<void>;
}

export const META_TAG = '<meta name="cme-host" content="/api">';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

export function createHostServer(opts: HostOptions): HostServer {
  const root = path.resolve(opts.root);
  const appDir = path.resolve(opts.appDir);
  const clients = new Set<http.ServerResponse>();

  const broadcast: HostServer['broadcast'] = (event) => {
    const frame = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of clients) res.write(frame);
  };

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      if (!res.headersSent) send(res, 500, 'text/plain; charset=utf-8', `internal error: ${String(err)}`);
      else res.end();
    });
  });

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return send(res, 405, 'text/plain; charset=utf-8', 'method not allowed');
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return send(res, 400, 'text/plain; charset=utf-8', 'malformed url');
    }

    if (pathname === '/api/files') return sendJson(res, { dir: path.basename(root), root, files: await listCmeFiles(root) });
    if (pathname.startsWith('/api/files/')) return sendCme(res, pathname.slice('/api/files/'.length));
    if (pathname === '/api/events') return openEventStream(res);
    if (pathname.startsWith('/api/')) return send(res, 404, 'text/plain; charset=utf-8', 'no such endpoint');
    return sendStatic(res, pathname);
  }

  async function sendCme(res: http.ServerResponse, rel: string): Promise<void> {
    const abs = resolveCme(root, rel);
    if (!abs) return send(res, 404, 'text/plain; charset=utf-8', 'not a .cme file inside the hosted directory');
    try {
      return send(res, 200, 'text/plain; charset=utf-8', await readFile(abs, 'utf8'));
    } catch {
      return send(res, 404, 'text/plain; charset=utf-8', `no such file: ${rel}`);
    }
  }

  function openEventStream(res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    res.write('retry: 1000\n\n');
    clients.add(res);
    res.on('close', () => clients.delete(res));
  }

  async function sendStatic(res: http.ServerResponse, pathname: string): Promise<void> {
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const abs = path.resolve(appDir, rel);
    if (abs !== appDir && !abs.startsWith(appDir + path.sep)) return send(res, 404, 'text/plain; charset=utf-8', 'not found');
    try {
      if (!(await stat(abs)).isFile()) throw new Error('not a file');
      const type = MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream';
      if (rel === 'index.html') {
        const html = (await readFile(abs, 'utf8')).replace('</head>', `  ${META_TAG}\n  </head>`);
        return send(res, 200, type, html);
      }
      return send(res, 200, type, await readFile(abs));
    } catch {
      return send(res, 404, 'text/plain; charset=utf-8', 'not found');
    }
  }

  let watcher: FSWatcher | undefined;
  if (opts.watch !== false) {
    let timer: NodeJS.Timeout | undefined;
    try {
      watcher = watch(root, { recursive: true }, (_event, filename) => {
        const changed = filename?.toString();
        // editors write .cme.swp / .cme~ and folders emit events too — only real models matter
        if (changed && !isCme(changed)) return;
        clearTimeout(timer);
        timer = setTimeout(() => broadcast({ type: 'change', path: changed?.split(path.sep).join('/') }), 120);
      });
      watcher.on('error', () => {}); // live reload is a nicety, never a reason to crash
    } catch {
      watcher = undefined;
    }
  }

  return {
    server,
    broadcast,
    close: () =>
      new Promise((resolve) => {
        watcher?.close();
        for (const res of clients) res.end();
        clients.clear();
        server.close(() => resolve());
      }),
  };
}

function send(res: http.ServerResponse, status: number, type: string, body: string | Buffer): void {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store', // a local tool: the freshest bundle and files, always
  });
  res.end(body);
}

function sendJson(res: http.ServerResponse, body: unknown): void {
  send(res, 200, 'application/json; charset=utf-8', JSON.stringify(body));
}
