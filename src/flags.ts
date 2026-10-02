// Feature flags: unfinished features ship dark, so `main` stays deployable.
//
// A flag is OFF unless turned on, either
//   - at build time:  VITE_FEATURES=analysis npm run build   (comma-separated)
//   - per visit:      https://…/?features=analysis
// and the URL can also force one off again with a leading minus: ?features=-analysis

export interface Flags {
  /** Side panel with strategic advice, coupling metrics and connascence risks. */
  analysis: boolean;
  /**
   * Models written in TypeScript: the DSL | TS switch, .cme.ts import/export and
   * .cme.ts files in hosted mode. Off, the app never runs a line of model code.
   */
  typescript: boolean;
}

const DEFAULTS: Flags = {
  analysis: false,
  typescript: false,
};

/** Pure resolver: defaults ← build-time list ← URL query, later sources win. */
export function resolveFlags(buildTime: string | undefined, search: string): Flags {
  const flags: Flags = { ...DEFAULTS };
  const fromUrl = new URLSearchParams(search).get('features') ?? '';
  for (const entry of [...(buildTime ?? '').split(','), ...fromUrl.split(',')]) {
    const off = entry.trim().startsWith('-');
    const name = entry.trim().replace(/^-/, '');
    // unknown names are ignored — a stale link must not break the app
    if (Object.prototype.hasOwnProperty.call(DEFAULTS, name)) flags[name as keyof Flags] = !off;
  }
  return flags;
}
