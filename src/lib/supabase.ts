/**
 * Supabase client — Administracja: wyłącznie sesja Supabase Auth (e-mail / hasło).
 * Konfiguracja storage zgodna z panelem DOMIO pod kątem SSO na domenie produkcyjnej.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Missing Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)");
}

const createCookieStorage = () => {
  const isProduction = window.location.hostname.includes("domio.com.pl");
  const useCookies = isProduction;

  const cookieOptions = {
    domain: ".domio.com.pl",
    sameSite: "Lax" as const,
    path: "/",
  };

  const getCookie = (name: string): string | null => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      return parts.pop()?.split(";").shift() || null;
    }
    return null;
  };

  const setCookie = (name: string, value: string, days: number = 7): void => {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    if (useCookies) {
      const isSecure = window.location.protocol === "https:";
      const secureFlag = isSecure ? ";Secure" : "";
      document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=${cookieOptions.path};domain=${cookieOptions.domain};SameSite=${cookieOptions.sameSite}${secureFlag}`;
    } else {
      document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
    }
  };

  const removeCookie = (name: string): void => {
    if (useCookies) {
      const isSecure = window.location.protocol === "https:";
      const secureFlag = isSecure ? ";Secure" : "";
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=${cookieOptions.path};domain=${cookieOptions.domain};SameSite=${cookieOptions.sameSite}${secureFlag}`;
    } else {
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Lax`;
    }
  };

  if (useCookies) {
    return {
      getItem: (key: string): string | null => getCookie(key),
      setItem: (key: string, value: string): void => setCookie(key, value),
      removeItem: (key: string): void => removeCookie(key),
    };
  }

  return {
    getItem: (key: string): string | null => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key: string, value: string): void => {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        console.error("[supabase] localStorage setItem failed:", e);
      }
    },
    removeItem: (key: string): void => {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        console.error("[supabase] localStorage removeItem failed:", e);
      }
    },
  };
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storageKey: "domio-auth-token",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    storage: createCookieStorage(),
  },
  global: {
    headers: { "X-Client-Info": "domio-administracja" },
  },
});
