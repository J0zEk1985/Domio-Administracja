/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Centralny hub logowania (SSO), np. https://logowanie.domio.com.pl */
  readonly VITE_AUTH_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
