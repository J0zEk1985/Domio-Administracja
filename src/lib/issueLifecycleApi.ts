import { supabase } from "@/lib/supabase";
import {
  issueLifecycleErrorMessagePl,
  type IssueLifecycleEvent,
} from "@/types/issueLifecycle";

type RpcError = { message?: string } | null;

async function invokeRpc(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const { data, error } = await supabase.rpc(
    fn as never,
    args as never,
  );
  if (error) {
    const wrapped = new Error(issueLifecycleErrorMessagePl(error as RpcError));
    console.error(`[issueLifecycleApi] ${fn}`, error);
    throw wrapped;
  }
  return data;
}

export async function rejectPropertyIssue(
  issueId: string,
  reason: string,
): Promise<void> {
  await invokeRpc("reject_property_issue", {
    p_issue_id: issueId,
    p_reason: reason,
  });
}

export async function cancelPropertyIssue(
  issueId: string,
  reason: string,
): Promise<void> {
  await invokeRpc("cancel_property_issue", {
    p_issue_id: issueId,
    p_reason: reason,
  });
}

export async function requestPropertyIssueCancel(
  issueId: string,
  reason: string,
): Promise<void> {
  await invokeRpc("request_property_issue_cancel", {
    p_issue_id: issueId,
    p_reason: reason,
  });
}

export async function broadcastPropertyIssue(issueId: string): Promise<void> {
  await invokeRpc("broadcast_property_issue", { p_issue_id: issueId });
}

export async function delegatePropertyIssue(
  issueId: string,
  vendorId: string,
): Promise<void> {
  await invokeRpc("delegate_property_issue", {
    p_issue_id: issueId,
    p_vendor_id: vendorId,
  });
}

export async function requestPropertyIssueTransfer(
  issueId: string,
  vendorId: string,
  reason: string,
): Promise<void> {
  await invokeRpc("request_property_issue_transfer", {
    p_issue_id: issueId,
    p_vendor_id: vendorId,
    p_reason: reason,
  });
}

export async function authorizePropertyIssueTransfer(
  issueId: string,
): Promise<void> {
  await invokeRpc("authorize_property_issue_transfer", {
    p_issue_id: issueId,
  });
}

export async function declinePropertyIssueTransfer(
  issueId: string,
): Promise<void> {
  await invokeRpc("decline_property_issue_transfer", {
    p_issue_id: issueId,
  });
}

export async function listIssueLifecycleEvents(
  issueId: string,
): Promise<IssueLifecycleEvent[]> {
  const data = await invokeRpc("list_issue_lifecycle_events", {
    p_issue_id: issueId,
  });
  return (Array.isArray(data) ? data : []) as IssueLifecycleEvent[];
}
