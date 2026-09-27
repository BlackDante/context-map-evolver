// Entry point of the `context-map-evolver` command (bundled to dist/cli/index.js).
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT, USAGE, UsageError, parseArgs, type HostArgs } from './args';
import { createHostServer } from './host';
import { listCmeFiles } from './files';
import { openInBrowser } from './open';

/** Runs the CLI; resolves to the process exit code. */
export async function run(argv: string[]): Promise<number> {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`error: ${err.message}\n`);
      console.error(USAGE);
      return 2;
    }
    throw err;
  }
  if (args.command === 'help') {
    console.log(USAGE);
    return 0;
  }
  if (args.command === 'version') {
    console.log(version());
    return 0;
  }
  return host(args);
}

async function host(args: HostArgs): Promise<number> {
  // the bundle lives in dist/cli/, the app right above it in dist/
  const appDir = fileURLToPath(new URL('..', import.meta.url));

  let root: string;
  let initialFile: string | undefined;
  try {
    const target = path.resolve(args.target);
    const info = await stat(target);
    if (info.isDirectory()) {
      root = target;
    } else {
      root = path.dirname(target);
      initialFile = path.basename(target);
    }
  } catch {
    console.error(`error: '${args.target}' does not exist`);
    return 1;
  }

  const hosted = createHostServer({ root, appDir });
  let port: number;
  try {
    port = await listen(hosted.server, args.port);
  } catch (err) {
    console.error(`error: could not start the server: ${(err as Error).message}`);
    return 1;
  }

  const url = `http://localhost:${port}/${initialFile ? `?file=${encodeURIComponent(initialFile)}` : ''}`;
  const files = await listCmeFiles(root);
  console.log(`Context Map Evolver ${version()}`);
  console.log(`  hosting  ${root}`);
  console.log(`  files    ${files.length} .cme file${files.length === 1 ? '' : 's'}${files.length ? '' : ' — drop one in, it will show up'}`);
  console.log(`  open     ${url}`);
  console.log('  press Ctrl+C to stop');
  if (args.open) openInBrowser(url);

  await new Promise<void>((resolve) => {
    const stop = () => {
      console.log('\nstopping…');
      hosted.close().then(resolve);
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  return 0;
}

/**
 * Listen on 127.0.0.1. With no explicit port, walk up from the default until a
 * free one is found — two hosted directories side by side must both just work.
 */
function listen(server: import('node:http').Server, explicit: number | undefined): Promise<number> {
  const attempts = explicit === undefined ? 20 : 1;
  let port = explicit ?? DEFAULT_PORT;
  return new Promise((resolve, reject) => {
    let left = attempts;
    const tryPort = () => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && --left > 0) {
          port++;
          tryPort();
        } else {
          reject(err);
        }
      });
      server.listen(port, '127.0.0.1', () => {
        server.removeAllListeners('error');
        const address = server.address();
        resolve(typeof address === 'object' && address ? address.port : port);
      });
    };
    tryPort();
  });
}

function version(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    return `v${pkg.version}`;
  } catch {
    return 'v?';
  }
}
