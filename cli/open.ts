// Opening a URL in the default browser without a dependency.
import { spawn } from 'node:child_process';

/** The platform's "open this URL" command. Exposed for tests; `openInBrowser` uses it. */
export function browserCommand(url: string, platform: NodeJS.Platform): [string, string[]] {
  if (platform === 'darwin') return ['open', [url]];
  // `start` treats its first quoted argument as a window title — pass an empty one
  if (platform === 'win32') return ['cmd', ['/c', 'start', '', url]];
  return ['xdg-open', [url]];
}

/** Best effort: a headless box without a browser must not take the server down. */
export function openInBrowser(url: string, platform: NodeJS.Platform = process.platform): void {
  const [cmd, args] = browserCommand(url, platform);
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // ignore — the URL is printed anyway
  }
}
