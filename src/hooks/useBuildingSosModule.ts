import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import { getOrgAndActor, hasLocationAdministrationAccess } from "@/lib/orgAccess";

export const buildingSosModuleQueryKey = (locationId: string) =>
  ["building-sos-module", locationId] as const;

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return fallback;
}

async function assertCanManageLocation(locationId: string): Promise<void> {
  const actor = await getOrgAndActor();
  if (actor.isOwner) return;
  const ok = await hasLocationAdministrationAccess(actor.userId, locationId);
  if (!ok) {
    throw new Error("Brak uprawnień do zmiany modułu SOS dla tego budynku.");
  }
}

async function fetchEnabled(locationId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("resident_configs")
    .select("enable_sos")
    .eq("location_id", locationId)
    .maybeSingle();

  if (error) {
    console.error("[useBuildingSosModule] resident_configs:", error);
    throw error;
  }

  return data?.enable_sos === true;
}

export function useBuildingSosModule(locationId: string, orgId: string) {
  const qc = useQueryClient();
  const queryKey = buildingSosModuleQueryKey(locationId);

  const query = useQuery({
    queryKey,
    queryFn: () => fetchEnabled(locationId),
    enabled: Boolean(locationId && orgId),
  });

  const mutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!locationId.trim() || !orgId.trim()) {
        throw new Error("Brak identyfikatora budynku.");
      }
      await assertCanManageLocation(locationId);

      const { error } = await supabase.from("resident_configs").upsert(
        {
          location_id: locationId,
          org_id: orgId,
          enable_sos: enabled,
        },
        { onConflict: "location_id" },
      );

      if (error) {
        console.error("[useBuildingSosModule] upsert:", error);
        throw error;
      }
    },
    onMutate: async (enabled) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<boolean>(queryKey);
      qc.setQueryData(queryKey, enabled);
      return { previous };
    },
    onSuccess: (_data, enabled) => {
      toast.success(
        enabled
          ? "Moduł SOS jest włączony na tym budynku."
          : "Moduł SOS jest wyłączony na tym budynku.",
      );
    },
    onError: (err, _enabled, ctx) => {
      if (typeof ctx?.previous === "boolean") {
        qc.setQueryData(queryKey, ctx.previous);
      }
      toast.error(errorMessage(err, "Nie udało się zapisać modułu SOS."));
      console.error("[useBuildingSosModule]", err);
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey });
    },
  });

  return {
    enabled: query.data === true,
    isLoading: query.isLoading,
    isError: query.isError,
    isSaving: mutation.isPending,
    save: mutation.mutate,
  };
}
