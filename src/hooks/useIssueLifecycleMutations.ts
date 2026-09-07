import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  authorizePropertyIssueTransfer,
  broadcastPropertyIssue,
  cancelPropertyIssue,
  declinePropertyIssueTransfer,
  delegatePropertyIssue,
  listIssueLifecycleEvents,
  rejectPropertyIssue,
  requestPropertyIssueCancel,
  requestPropertyIssueTransfer,
} from "@/lib/issueLifecycleApi";
import { pendingIssuesCountQueryKey } from "@/hooks/usePendingIssuesCount";
import { triageIssuesQueryKey } from "@/hooks/useTriageIssues";
import { toast } from "@/components/ui/sonner";
import { issueLifecycleErrorMessagePl } from "@/types/issueLifecycle";

export const issueLifecycleEventsQueryKey = (issueId: string | null) =>
  ["issue-lifecycle-events", issueId] as const;

function toastRpcError(err: unknown, context: string): void {
  console.error(context, err);
  toast.error(issueLifecycleErrorMessagePl(err));
}

async function invalidateTriage(qc: ReturnType<typeof useQueryClient>) {
  await qc.invalidateQueries({ queryKey: triageIssuesQueryKey() });
  await qc.invalidateQueries({ queryKey: pendingIssuesCountQueryKey() });
}

export function useIssueLifecycleEvents(issueId: string | null) {
  return useQuery({
    queryKey: issueLifecycleEventsQueryKey(issueId),
    enabled: Boolean(issueId),
    queryFn: () => listIssueLifecycleEvents(issueId as string),
  });
}

export function useCancelPropertyIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, reason }: { issueId: string; reason: string }) =>
      cancelPropertyIssue(issueId, reason),
    onError: (err) => toastRpcError(err, "[useCancelPropertyIssue]"),
    onSettled: async () => {
      await invalidateTriage(qc);
    },
    onSuccess: () => {
      toast.success("Zlecenie anulowane. Technik i koordynator mają wpis w historii.");
    },
  });
}

export function useRequestPropertyIssueCancel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, reason }: { issueId: string; reason: string }) =>
      requestPropertyIssueCancel(issueId, reason),
    onError: (err) => toastRpcError(err, "[useRequestPropertyIssueCancel]"),
    onSettled: async () => {
      await invalidateTriage(qc);
    },
    onSuccess: () => {
      toast.success("Wysłano wniosek o anulowanie.");
    },
  });
}

export function useRequestPropertyIssueTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      issueId,
      vendorId,
      reason,
    }: {
      issueId: string;
      vendorId: string;
      reason: string;
    }) => requestPropertyIssueTransfer(issueId, vendorId, reason),
    onError: (err) => toastRpcError(err, "[useRequestPropertyIssueTransfer]"),
    onSettled: async () => {
      await invalidateTriage(qc);
    },
    onSuccess: () => {
      toast.success("Wniosek o cesję oczekuje na zgodę kontrahenta.");
    },
  });
}

export function useAuthorizePropertyIssueTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId }: { issueId: string }) =>
      authorizePropertyIssueTransfer(issueId),
    onError: (err) => toastRpcError(err, "[useAuthorizePropertyIssueTransfer]"),
    onSettled: async () => {
      await invalidateTriage(qc);
    },
    onSuccess: () => {
      toast.success("Cesja zaakceptowana.");
    },
  });
}

export function useDeclinePropertyIssueTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId }: { issueId: string }) =>
      declinePropertyIssueTransfer(issueId),
    onError: (err) => toastRpcError(err, "[useDeclinePropertyIssueTransfer]"),
    onSettled: async () => {
      await invalidateTriage(qc);
    },
    onSuccess: () => {
      toast.success("Wniosek o cesję odrzucony.");
    },
  });
}

export { rejectPropertyIssue, broadcastPropertyIssue, delegatePropertyIssue };
