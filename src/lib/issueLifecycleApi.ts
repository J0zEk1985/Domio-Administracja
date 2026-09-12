import { supabase } from "@/lib/supabase";
import {
  issueLifecycleErrorMessagePl,
  type IssueLifecycleEvent,
} from "@/types/issueLifecycle";
import type { VendorIssueEmailPayload } from "@/types/vendorEmail";

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

export async function broadcastPropertyIssue(
  issueId: string,
  scope: "serving" | "all",
): Promise<void> {
  await invokeRpc("broadcast_property_issue", {
    p_issue_id: issueId,
    p_scope: scope,
  });
}

function resolveVendorIssueWebhookUrl(): string | null {
  const fromEnv = (
    import.meta.env.VITE_N8N_VENDOR_ISSUE_WEBHOOK_URL as string | undefined
  )?.trim();
  return fromEnv || null;
}

async function triggerVendorIssueDispatchWebhook(issueId: string): Promise<void> {
  const webhook = resolveVendorIssueWebhookUrl();
  if (!webhook) {
    console.warn(
      "[issueLifecycleApi] Brak VITE_N8N_VENDOR_ISSUE_WEBHOOK_URL — e-mail nie został wysłany.",
    );
    return;
  }

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId }),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(bodyText.trim() || `Webhook n8n: ${res.status}`);
    }
  } catch (err) {
    console.error("[issueLifecycleApi] n8n vendor dispatch webhook:", err);
    throw err instanceof Error
      ? err
      : new Error("Nie udało się wywołać automatyzacji n8n.");
  }
}

export async function delegatePropertyIssue(
  issueId: string,
  vendorId: string,
): Promise<VendorIssueEmailPayload | null> {
  const data = await invokeRpc("delegate_property_issue", {
    p_issue_id: issueId,
    p_vendor_id: vendorId,
  });

  const payload = (data ?? null) as VendorIssueEmailPayload | null;
  if (!payload?.queued) {
    return payload;
  }

  await triggerVendorIssueDispatchWebhook(issueId);
  return payload;
}

export async function queueIssueEmailDispatch(
  issueId: string,
  vendorId?: string | null,
): Promise<VendorIssueEmailPayload | null> {
  const args: Record<string, unknown> = { p_issue_id: issueId };
  if (vendorId) {
    args.p_vendor_id = vendorId;
  }
  const data = await invokeRpc("queue_issue_email_dispatch", args);
  const payload = (data ?? null) as VendorIssueEmailPayload | null;
  await triggerVendorIssueDispatchWebhook(issueId);
  return payload;
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
