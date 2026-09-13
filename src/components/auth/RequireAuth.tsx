import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { userHasModuleAccess } from "@/lib/moduleAccess";
import NoModuleAccess from "@/pages/NoModuleAccess";

type AuthState = "loading" | "authed" | "anon" | "denied";

export function RequireAuth() {
  const location = useLocation();
  const [state, setState] = useState<AuthState>("loading");

  useEffect(() => {
    let cancelled = false;

    const resolveAccess = async (hasSession: boolean) => {
      if (!hasSession) {
        if (!cancelled) setState("anon");
        return;
      }
      const allowed = await userHasModuleAccess(supabase, "administracja");
      if (!cancelled) setState(allowed ? "authed" : "denied");
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      void resolveAccess(Boolean(session));
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void resolveAccess(Boolean(session));
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-background">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
    );
  }

  if (state === "anon") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (state === "denied") {
    return <NoModuleAccess />;
  }

  return <Outlet />;
}
