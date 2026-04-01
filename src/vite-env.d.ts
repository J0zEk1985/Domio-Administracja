/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /**
   * Domena centralnego panelu logowania (SSO) — jak Domio-Serwis (`HUB_LOGIN_URL`).
   * Przykład: `https://domio.com.pl` → logowanie pod `${VITE_HUB_URL}/login`.
   */
  readonly VITE_HUB_URL?: string;
  /** Publiczny origin aplikacji DOMIO Serwis (linki QR zgłoszeń). Domyślnie https://serwis.domio.com.pl */
  readonly VITE_SERWIS_PUBLIC_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
