import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";

const DEFAULT_AUTH_HUB_URL = "https://logowanie.domio.com.pl";

function getAuthHubUrl(): string {
  const raw = import.meta.env.VITE_AUTH_URL?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_AUTH_HUB_URL;
}

/** Redirect to central login; `returnTo` matches Panel Logowania (full app URL after SSO). */
function goToCentralLogin(returnPath: string) {
  const hubBase = getAuthHubUrl();
  let hub: URL;
  try {
    hub = new URL(hubBase);
  } catch {
    console.error("[Login] Invalid VITE_AUTH_URL, falling back to default hub");
    hub = new URL(DEFAULT_AUTH_HUB_URL);
  }
  const returnTarget = `${window.location.origin}${returnPath}`;
  hub.searchParams.set("returnTo", returnTarget);
  window.location.assign(hub.toString());
}

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

  if (!sessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="h-10 w-64 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (hasSession) {
    return <Navigate to={safeReturnPath} replace />;
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="absolute right-4 top-4 md:right-6 md:top-6">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md border-border/60 shadow-md">
        <CardHeader className="space-y-3 pb-2 text-center">
          <div className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1">
            <span className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">DOMIO</span>
            <span className="font-display text-3xl font-bold tracking-tight text-accent md:text-4xl">Admin</span>
          </div>
          <CardDescription className="text-base text-muted-foreground">
            System zarządzania nieruchomościami
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2 pb-8">
          <Button
            type="button"
            size="lg"
            className="h-12 w-full gap-2 bg-accent text-accent-foreground text-base font-semibold shadow-sm hover:bg-accent/90"
            onClick={() => goToCentralLogin(safeReturnPath)}
          >
            Zaloguj się
            <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
