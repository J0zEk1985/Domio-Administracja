import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import { triageIssuesQueryKey, type TriageIssue } from "@/hooks/useTriageIssues";
import type { Database } from "@/types/supabase";

type IssueStatus = Database["public"]["Enums"]["issue_status_enum"];

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Operacja nie powiodła się.";
}

type Ctx = { previous: TriageIssue[] | undefined };

function patchIssue(
  list: TriageIssue[] | undefined,
  issueId: string,
  patch: Partial<TriageIssue>,
): TriageIssue[] | undefined {
  if (!list) return list;
  return list.map((i) => (i.id === issueId ? { ...i, ...patch } : i));
}

export type RejectIssueVars = { issueId: string; reason: string };

export function useRejectIssue() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ issueId, reason }: RejectIssueVars) => {
      const trimmed = reason.trim();
      if (!trimmed) throw new Error("Podaj powód odrzucenia.");

      const { error } = await supabase
        .from("property_issues")
        .update({
          status: "rejected" satisfies IssueStatus,
          resolution_notes: trimmed,
        })
        .eq("id", issueId);

      if (error) {
        console.error("[useRejectIssue] update:", error);
        throw error;
      }
    },
    onMutate: async ({ issueId }): Promise<Ctx> => {
      await qc.cancelQueries({ queryKey: triageIssuesQueryKey() });
      const previous = qc.getQueryData<TriageIssue[]>(triageIssuesQueryKey());
      qc.setQueryData<TriageIssue[]>(triageIssuesQueryKey(), (old) =>
        old?.filter((i) => i.id !== issueId) ?? [],
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(triageIssuesQueryKey(), ctx.previous);
      }
      toast.error(errMessage(err));
      console.error("[useRejectIssue]", err);
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: triageIssuesQueryKey() });
    },
    onSuccess: () => {
      toast.success("Zgłoszenie odrzucone.");
    },
  });
}

export type DelegateIssueVars = { issueId: string; vendorId: string; vendorName: string };

export function useDelegateIssue() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ issueId, vendorId }: DelegateIssueVars) => {
      const { error } = await supabase
        .from("property_issues")
        .update({
          status: "delegated" satisfies IssueStatus,
          delegated_vendor_id: vendorId,
        })
        .eq("id", issueId);

      if (error) {
        console.error("[useDelegateIssue] update:", error);
        throw error;
      }
    },
    onMutate: async ({ issueId, vendorId, vendorName }): Promise<Ctx> => {
      await qc.cancelQueries({ queryKey: triageIssuesQueryKey() });
      const previous = qc.getQueryData<TriageIssue[]>(triageIssuesQueryKey());
      qc.setQueryData<TriageIssue[]>(triageIssuesQueryKey(), (old) =>
        patchIssue(old, issueId, {
          status: "delegated",
          delegated_vendor_id: vendorId,
          delegated_vendor: { name: vendorName },
        }),
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(triageIssuesQueryKey(), ctx.previous);
      }
      toast.error(errMessage(err));
      console.error("[useDelegateIssue]", err);
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: triageIssuesQueryKey() });
    },
    onSuccess: () => {
      toast.success("Delegacja zapisana.");
    },
  });
}

export type BroadcastIssueVars = { issueId: string };

export function useBroadcastIssue() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ issueId }: BroadcastIssueVars) => {
      const { error } = await supabase
        .from("property_issues")
        .update({ is_public_broadcast: true })
        .eq("id", issueId);

      if (error) {
        console.error("[useBroadcastIssue] update:", error);
        throw error;
      }
    },
    onMutate: async ({ issueId }): Promise<Ctx> => {
      await qc.cancelQueries({ queryKey: triageIssuesQueryKey() });
      const previous = qc.getQueryData<TriageIssue[]>(triageIssuesQueryKey());
      qc.setQueryData<TriageIssue[]>(triageIssuesQueryKey(), (old) =>
        patchIssue(old, issueId, { is_public_broadcast: true }),
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(triageIssuesQueryKey(), ctx.previous);
      }
      toast.error(errMessage(err));
      console.error("[useBroadcastIssue]", err);
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: triageIssuesQueryKey() });
    },
    onSuccess: () => {
      toast.success("Wysłano na giełdę.");
    },
  });
}

export type AssignStaffIssueVars = { issueId: string; staffId: string; staffName: string };

export function useAssignStaffIssue() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ issueId, staffId }: AssignStaffIssueVars) => {
      const { error } = await supabase
        .from("property_issues")
        .update({ assigned_staff_id: staffId })
        .eq("id", issueId);

      if (error) {
        console.error("[useAssignStaffIssue] update:", error);
        throw error;
      }
    },
    onMutate: async ({ issueId, staffId, staffName }): Promise<Ctx> => {
      await qc.cancelQueries({ queryKey: triageIssuesQueryKey() });
      const previous = qc.getQueryData<TriageIssue[]>(triageIssuesQueryKey());
      qc.setQueryData<TriageIssue[]>(triageIssuesQueryKey(), (old) =>
        patchIssue(old, issueId, {
          assigned_staff_id: staffId,
          assigned_staff: { full_name: staffName },
        }),
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(triageIssuesQueryKey(), ctx.previous);
      }
      toast.error(errMessage(err));
      console.error("[useAssignStaffIssue]", err);
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: triageIssuesQueryKey() });
    },
    onSuccess: () => {
      toast.success("Przypisano do pracownika.");
    },
  });
}

export type AcceptOpenIssueVars = { issueId: string };

export function useAcceptOpenIssue() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ issueId }: AcceptOpenIssueVars) => {
      const { error } = await supabase
        .from("property_issues")
        .update({ status: "open" satisfies IssueStatus })
        .eq("id", issueId);

      if (error) {
        console.error("[useAcceptOpenIssue] update:", error);
        throw error;
      }
    },
    onMutate: async ({ issueId }): Promise<Ctx> => {
      await qc.cancelQueries({ queryKey: triageIssuesQueryKey() });
      const previous = qc.getQueryData<TriageIssue[]>(triageIssuesQueryKey());
      qc.setQueryData<TriageIssue[]>(triageIssuesQueryKey(), (old) =>
        patchIssue(old, issueId, { status: "open" }),
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(triageIssuesQueryKey(), ctx.previous);
      }
      toast.error(errMessage(err));
      console.error("[useAcceptOpenIssue]", err);
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: triageIssuesQueryKey() });
    },
    onSuccess: () => {
      toast.success("Zgłoszenie zaakceptowane.");
    },
  });
}
