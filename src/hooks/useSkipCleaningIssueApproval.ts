import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import { getOrgAndActor, hasLocationAdministrationAccess } from "@/lib/orgAccess";

export const SKIP_CLEANING_APPROVAL_QUERY_ROOT = "skip-cleaning-issue-approval" as const;

export function skipCleaningApprovalQueryKey(locationId: string) {
  return [SKIP_CLEANING_APPROVAL_QUERY_ROOT, locationId] as const;
}

async function fetchSkipCleaningIssueApproval(locationId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("cleaning_locations")
    .select("skip_cleaning_issue_approval")
    .eq("id", locationId)
    .maybeSingle();

  if (error) {
    console.error("[fetchSkipCleaningIssueApproval]", error);
    throw error;
  }
  return data?.skip_cleaning_issue_approval === true;
}

export function useSkipCleaningIssueApproval(locationId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: locationId
      ? skipCleaningApprovalQueryKey(locationId)
      : [SKIP_CLEANING_APPROVAL_QUERY_ROOT, "disabled"],
    queryFn: () => fetchSkipCleaningIssueApproval(locationId!),
    enabled: Boolean(locationId),
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (skip: boolean) => {
      if (!locationId?.trim()) throw new Error("Brak identyfikatora nieruchomości.");

      const actor = await getOrgAndActor();
      if (!actor.isOwner) {
        const ok = await hasLocationAdministrationAccess(actor.userId, locationId);
        if (!ok) {
          throw new Error("Brak uprawnień do zmiany routingu usterek na tym budynku.");
        }
      }

      const { error } = await supabase
        .from("cleaning_locations")
        .update({ skip_cleaning_issue_approval: skip })
        .eq("id", locationId);

      if (error) {
        console.error("[useSkipCleaningIssueApproval] update:", error);
        throw error;
      }
    },
    onSuccess: async (_data, skip) => {
      if (locationId) {
        await qc.invalidateQueries({ queryKey: skipCleaningApprovalQueryKey(locationId) });
      }
      toast.success(
        skip
          ? "Usterki z Cleaning pomijają akceptację i trafiają do Serwisu."
          : "Usterki z Cleaning wymagają akceptacji w Administracji.",
      );
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "Nie udało się zapisać ustawienia.";
      toast.error(msg);
      console.error("[useSkipCleaningIssueApproval]", err);
    },
  });

  return { query, mutation };
}
