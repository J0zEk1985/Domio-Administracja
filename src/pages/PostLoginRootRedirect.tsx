/**
 * Logged-in entry at `/`: restore last office vs field view (same idea as Serwis technician toggle).
 */

import { useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";

import { Skeleton } from "@/components/ui/skeleton";
import { getPreferredAppView } from "@/lib/sessionKeys";

export default function PostLoginRootRedirect() {
  const navigate = useNavigate();

  useLayoutEffect(() => {
    if (getPreferredAppView() === "field") {
      navigate("/quick-actions", { replace: true });
      return;
    }
    navigate("/dashboard", { replace: true });
  }, [navigate]);

  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col items-center justify-center gap-4 p-6">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}
