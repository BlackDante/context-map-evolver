// Command-line parsing for `context-map-evolver`. Pure, so it is unit-tested.

export interface HostArgs {
  command: 'host';
  /** Directory (or a single .cme file) to host. */
  target: string;
  /** Explicit port, or undefined to pick a free one starting from the default. */
  port?: number;
  open: boolean;
}

export type Args = HostArgs | { command: 'help' } | { command: 'version' };

export const DEFAULT_PORT = 5180;

export function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let port: number | undefined;
  let open = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { command: 'help' };
    if (arg === '--version' || arg === '-v') return { command: 'version' };
    if (arg === '--no-open') {
      open = false;
    } else if (arg === '--port' || arg === '-p' || arg.startsWith('--port=')) {
      const raw = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
      port = Number(raw);
      if (!raw || !Number.isInteger(port) || port < 0 || port > 65535) {
        throw new UsageError(`--port expects a number between 0 and 65535, got '${raw ?? ''}'`);
      }
    } else if (arg.startsWith('-')) {
      throw new UsageError(`unknown option '${arg}'`);
    } else {
      positional.push(arg);
    }
  }

  const [command, target = '.', ...rest] = positional;
  if (command === undefined || command === 'help') return { command: 'help' };
  if (command !== 'host') throw new UsageError(`unknown command '${command}'`);
  if (rest.length) throw new UsageError(`unexpected argument '${rest[0]}'`);
  return { command: 'host', target, port, open };
}

export class UsageError extends Error {}

export const USAGE = `Context Map Evolver — DDD context maps as code

Usage
  context-map-evolver host [directory|file.cme] [options]

  Serves the app locally with every .cme file found under the directory
  (recursively) in the file picker, and opens it in your browser. Files are
  re-read when they change on disk.

Options
  -p, --port <n>   port to listen on (default: first free port from ${DEFAULT_PORT})
      --no-open    do not open the browser
  -h, --help       show this help
  -v, --version    print the version

Examples
  npx context-map-evolver host ./architecture
  npx context-map-evolver host docs/context-map.cme --port 8080
`;
