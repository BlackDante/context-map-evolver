// The two ways to write a model: the .cme DSL, or TypeScript against the
// builder API (src/builder.ts). A file says which one it is by its name.

export type Lang = 'dsl' | 'ts';

/** `payments.cme.ts` is TypeScript; everything else is read as DSL. */
export function languageOf(fileName: string): Lang {
  return /\.ts$/i.test(fileName) ? 'ts' : 'dsl';
}

/** The extension a model in this language is saved with. */
export function extensionOf(lang: Lang): string {
  return lang === 'ts' ? '.cme.ts' : '.cme';
}
