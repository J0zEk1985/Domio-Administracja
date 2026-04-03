import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";

import { toast } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import { propertyInspectionsQueryKey } from "@/hooks/usePropertyInspections";

export type SyncCKOBVariables = {
  locationId: string;
  cKobBuildingId: string;
};

const DEFAULT_WEBHOOK_PATH = "/api/webhooks/ckob-sync";

function resolveWebhookUrl(): string {
  const fromEnv = (import.meta.env.VITE_CKOB_SYNC_WEBHOOK_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_WEBHOOK_PATH;
}

/**
 * Triggers n8n / edge worker via HTTP POST. Dev server serves a mock 202 at
 * {@link DEFAULT_WEBHOOK_PATH} (see `vite.config.ts`). Override with `VITE_CKOB_SYNC_WEBHOOK_URL`.
 */
async function triggerCkobSync(variables: SyncCKOBVariables): Promise<void> {
  const url = resolveWebhookUrl();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (url.includes("/functions/v1/")) {
    const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
    if (anon) {
      headers.apikey = anon;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        locationId: variables.locationId,
        cKobBuildingId: variables.cKobBuildingId,
      }),
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(bodyText.trim() || `Żądanie zakończone kodem ${res.status}`);
    }
  } catch (err) {
    console.error("[useSyncCKOB] triggerCkobSync:", err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export function useSyncCKOB(): UseMutationResult<void, Error, SyncCKOBVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: triggerCkobSync,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: propertyInspectionsQueryKey(variables.locationId) });
      toast.success("Zlecono synchronizację z c-KOB. Może to potrwać kilkanaście sekund.");
    },
    onError: (err) => {
      toast.error(err.message || "Nie udało się zlecić synchronizacji z c-KOB.");
      console.error("[useSyncCKOB] mutation error:", err);
    },
  });
}
