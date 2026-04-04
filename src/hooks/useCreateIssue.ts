import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import { pendingIssuesCountQueryKey } from "@/hooks/usePendingIssuesCount";
import { propertyIssuesQueryKey } from "@/hooks/usePropertyIssues";
import { triageIssuesQueryKey } from "@/hooks/useTriageIssues";

const issuePriorityEnum = z.enum(["low", "medium", "high", "critical"]);

export const createIssueSchema = z.object({
  location_id: z.string().uuid({ message: "Wybierz budynek." }),
  /** Odczyt z `cleaning_locations.community_id` — brak kolumny w `property_issues`, używane w UI. */
  community_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  category: z.string().min(1, "Wybierz kategorię."),
  priority: issuePriorityEnum,
  description: z.string().min(10, "Opis musi mieć co najmniej 10 znaków."),
});

export type CreateIssueFormValues = z.infer<typeof createIssueSchema>;

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Nie udało się utworzyć zgłoszenia.";
}

export function useCreateIssue() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateIssueFormValues) => {
      const { community_id: _communityId, ...insertPayload } = input;
      void _communityId;
      const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
      if (orgErr) {
        console.error("[useCreateIssue] get_my_org_id_safe:", orgErr);
        throw orgErr;
      }
      if (!orgId || String(orgId).trim() === "") {
        throw new Error("Brak kontekstu organizacji.");
      }

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr) {
        console.error("[useCreateIssue] getUser:", userErr);
        throw userErr;
      }
      if (!user?.id) {
        throw new Error("Musisz być zalogowany, aby utworzyć zgłoszenie.");
      }

      const { error } = await supabase.from("property_issues").insert({
        org_id: String(orgId),
        location_id: insertPayload.location_id,
        category: insertPayload.category.trim(),
        priority: insertPayload.priority,
        description: insertPayload.description.trim(),
        status: "new",
        reporter_type: "admin",
        reporter_id: user.id,
        source: "admin_ui",
      });

      if (error) {
        console.error("[useCreateIssue] insert:", error);
        throw error;
      }
    },
    onSuccess: async (_data, variables) => {
      toast.success("Zgłoszenie zostało utworzone.");
      await qc.invalidateQueries({ queryKey: triageIssuesQueryKey() });
      await qc.invalidateQueries({ queryKey: pendingIssuesCountQueryKey() });
      await qc.invalidateQueries({ queryKey: propertyIssuesQueryKey(variables.location_id) });
    },
    onError: (err: unknown) => {
      toast.error(errMessage(err));
      console.error("[useCreateIssue]", err);
    },
  });
}
