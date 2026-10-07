import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import { pendingIssuesCountQueryKey } from "@/hooks/usePendingIssuesCount";
import { TRIAGE_ISSUES_QUERY_ROOT, type TriageIssue } from "@/hooks/useTriageIssues";
import { supabase } from "@/lib/supabase";

export type AssignIssueLocationVars = {
  issueId: string;
  locationId: string;
  location: { name: string | null; address: string | null };
};

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Nie udało się przypisać budynku.";
}

export function useAssignIssueLocation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: AssignIssueLocationVars) => {
      const { data, error } = await supabase.rpc("assign_issue_location", {
        p_issue_id: vars.issueId,
        p_location_id: vars.locationId,
      });
      if (error) {
        console.error("[useAssignIssueLocation] rpc:", error);
        throw error;
      }
      return data;
    },
    onSuccess: async (_data, vars) => {
      qc.setQueriesData<TriageIssue[]>({ queryKey: [TRIAGE_ISSUES_QUERY_ROOT] }, (old) => {
        if (!old) return old;
        return old.map((row) =>
          row.id === vars.issueId
            ? {
                ...row,
                location_id: vars.locationId,
                is_ai_draft: false,
                location: {
                  name: vars.location.name,
                  address: vars.location.address,
                  is_admin_active: true,
                },
              }
            : row,
        );
      });
      toast.success("Przypisano budynek.");
      await qc.invalidateQueries({ queryKey: [TRIAGE_ISSUES_QUERY_ROOT] });
      await qc.invalidateQueries({ queryKey: pendingIssuesCountQueryKey });
    },
    onError: (err) => {
      console.error("[useAssignIssueLocation]", err);
      toast.error(errMessage(err));
    },
  });
}
