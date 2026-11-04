/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "api" in a real deployment, built with --mode server. */
  readonly VITE_BACKEND?: string;
}
