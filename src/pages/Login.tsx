import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { HUB_LOGIN_URL, redirectToHubLogin } from "@/lib/hubLogin";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Ekran powitalny — struktura i przekierowanie jak Domio-Cleaning `LandingPage.tsx`
 * oraz mechanizm URL jak Domio-Serwis `redirectToHubLogin` (`VITE_HUB_URL` → https://domio.com.pl + `/login?returnTo=`).
 *
 * ENV: Upewnij się, że w `.env.local` masz `VITE_HUB_URL` ustawione na ten sam adres co w Domio-Serwis
 * (np. `https://domio.com.pl`) — centralny panel logowania to `${VITE_HUB_URL}/login`.
 */
export default function Login() {
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/dashboard";

  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  const safeReturnPath = useMemo(() => {
    const p = from.startsWith("/") ? from : "/dashboard";
    return p;
  }, [from]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.info(
        "[DOMIO Admin][Login] Hub (VITE_HUB_URL):",
        HUB_LOGIN_URL,
        "— ustaw w .env.local jak w Domio-Serwis (centralny panel: /login na tej domenie).",
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) {
        setHasSession(!!session);
        setSessionChecked(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = () => {
    const postLoginTarget = `${window.location.origin}${safeReturnPath}`;
    redirectToHubLogin(postLoginTarget);
  };

  if (!sessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#1E222D] p-4">
        <div className="h-10 w-64 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  if (hasSession) {
    return <Navigate to={safeReturnPath} replace />;
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-white dark:bg-[#1E222D]">
      <div className="absolute top-6 right-6 z-10 flex items-center gap-2">
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center px-8 py-16">
        <div className="w-full max-w-md">
          <Card className="border-0 bg-white shadow-lg dark:bg-[#2C3241] dark:shadow-2xl rounded-2xl">
            <CardContent className="p-8">
              <div className="mb-8 text-center">
                <h1 className="mb-2 text-4xl font-bold">
                  <span className="text-gray-900 dark:text-white">DOMIO</span>
                  <span className="ml-2 text-orange-500 dark:text-orange-400">Admin</span>
                </h1>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  System zarządzania nieruchomościami
                </p>
              </div>

              <Button
                type="button"
                onClick={handleLogin}
                className="h-12 w-full rounded-full bg-orange-500 text-base font-medium text-white shadow-md hover:bg-orange-600 dark:bg-orange-500 dark:hover:bg-orange-600"
              >
                Zaloguj się
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden />
              </Button>

              <div className="mt-6 flex justify-center gap-2">
                <div className="h-2 w-2 rounded-full bg-orange-500 dark:bg-orange-400" />
                <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <footer className="py-4 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">© DOMIO</p>
      </footer>
    </div>
  );
}
