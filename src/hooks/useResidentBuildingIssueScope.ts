import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import { getOrgAndActor, hasLocationAdministrationAccess } from "@/lib/orgAccess";

export type ResidentBuildingIssueScope = "resident_reports" | "all_open";

export const residentBuildingIssueScopeQueryKey = (locationId: string) =>
  ["resident-building-issue-scope", locationId] as const;

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
    throw new Error("Brak uprawnień do zmiany widoczności usterek dla tego budynku.");
  }
}

async function fetchScope(locationId: string): Promise<ResidentBuildingIssueScope> {
  const { data, error } = await supabase
    .from("resident_configs")
    .select("resident_building_issue_scope")
    .eq("location_id", locationId)
    .maybeSingle();

  if (error) {
    console.error("[useResidentBuildingIssueScope] resident_configs:", error);
    throw error;
  }

  return data?.resident_building_issue_scope ?? "resident_reports";
}

export function useResidentBuildingIssueScope(locationId: string, orgId: string) {
  const qc = useQueryClient();
  const queryKey = residentBuildingIssueScopeQueryKey(locationId);

  const query = useQuery({
    queryKey,
    queryFn: () => fetchScope(locationId),
    enabled: Boolean(locationId && orgId),
  });

  const mutation = useMutation({
    mutationFn: async (scope: ResidentBuildingIssueScope) => {
      if (!locationId.trim() || !orgId.trim()) {
        throw new Error("Brak identyfikatora budynku.");
      }
      await assertCanManageLocation(locationId);

      const { error } = await supabase.from("resident_configs").upsert(
        {
          location_id: locationId,
          org_id: orgId,
          resident_building_issue_scope: scope,
        },
        { onConflict: "location_id" },
      );

      if (error) {
        console.error("[useResidentBuildingIssueScope] upsert:", error);
        throw error;
      }
    },
    onMutate: async (scope) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<ResidentBuildingIssueScope>(queryKey);
      qc.setQueryData(queryKey, scope);
      return { previous };
    },
    onSuccess: (_data, scope) => {
      toast.success(
        scope === "all_open"
          ? "Mieszkańcy widzą wszystkie otwarte usterki budynku."
          : "Mieszkańcy widzą tylko zgłoszenia z aplikacji i kodu QR.",
      );
    },
    onError: (err, _scope, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(queryKey, ctx.previous);
      }
      toast.error(errorMessage(err, "Nie udało się zapisać widoczności usterek."));
      console.error("[useResidentBuildingIssueScope]", err);
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey });
    },
  });

  return {
    scope: query.data ?? "resident_reports",
    isLoading: query.isLoading,
    isError: query.isError,
    isSaving: mutation.isPending,
    save: mutation.mutate,
  };
}
