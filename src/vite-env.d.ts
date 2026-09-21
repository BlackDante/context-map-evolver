/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Comma-separated feature flags to switch on at build time — see src/flags.ts. */
  readonly VITE_FEATURES?: string;
}
