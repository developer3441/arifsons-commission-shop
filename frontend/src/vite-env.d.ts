/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin baked in at build time (ADR-0026). Unset in dev — the Vite proxy serves /api. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
