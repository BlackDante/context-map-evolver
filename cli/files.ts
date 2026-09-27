// Discovering and safely resolving the .cme files under the hosted directory.
import { readdir } from 'node:fs/promises';
import path from 'node:path';

export interface CmeFile {
  /** Path relative to the hosted root, always with forward slashes. */
  path: string;
  /** Display name: the relative path without its extension, e.g. "billing/payments". */
  name: string;
}

// build output and dependency trees are never where someone keeps their models
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'build', 'target']);

/** Every `.cme` file under `root`, recursively, sorted by path. Dot-entries and symlinks are skipped. */
export async function listCmeFiles(root: string): Promise<CmeFile[]> {
  const out: CmeFile[] = [];
  await walk(root, '', out);
  return out.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

async function walk(root: string, rel: string, out: CmeFile[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(path.join(root, rel), { withFileTypes: true });
  } catch {
    return; // vanished or unreadable mid-scan — nothing to list there
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(root, relPath, out);
    } else if (entry.isFile() && isCme(entry.name)) {
      out.push({ path: relPath, name: relPath.replace(/\.cme$/i, '') });
    }
  }
}

export function isCme(name: string): boolean {
  return /\.cme$/i.test(name);
}

/**
 * Turn a request-supplied relative path into an absolute one, or `null` when it
 * is not a `.cme` file or would escape `root` (`../`, absolute paths, NUL bytes).
 */
export function resolveCme(root: string, rel: string): string | null {
  if (!rel || rel.includes('\0') || !isCme(rel) || path.isAbsolute(rel) || /^[a-z]:/i.test(rel)) return null;
  const rootAbs = path.resolve(root);
  const abs = path.resolve(rootAbs, rel);
  return abs.startsWith(rootAbs + path.sep) ? abs : null;
}
