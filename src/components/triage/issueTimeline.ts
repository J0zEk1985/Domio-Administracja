import type { Json } from "@/types/supabase";
import type { TriageIssue } from "@/hooks/useTriageIssues";
import type {
  IssueLifecycleEvent,
  IssueLifecycleEventType,
} from "@/types/issueLifecycle";

export type TimelineEntry = {
  id: string;
  title: string;
  at: string;
  detail?: string;
};

function parseIso(d: string | null | undefined): number | null {
  if (!d?.trim()) return null;
  const t = Date.parse(d);
  return Number.isFinite(t) ? t : null;
}

function pushIf(
  out: TimelineEntry[],
  id: string,
  title: string,
  at: string | null | undefined,
  detail?: string,
): void {
  const t = parseIso(at ?? null);
  if (t == null) return;
  out.push({ id, title, at: at!, detail });
}

function tryParseInternalComments(json: Json | null, fallbackAt: string | null): TimelineEntry[] {
  if (json == null) return [];
  if (Array.isArray(json)) {
    return json
      .map((item, i) => {
        if (typeof item === "string" && item.trim()) {
          const at = fallbackAt?.trim() || new Date().toISOString();
          return {
            id: `json-str-${i}`,
            title: "Notatka wewnętrzna",
            at,
            detail: item.trim(),
          } satisfies TimelineEntry;
        }
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const o = item as Record<string, unknown>;
          const at =
            typeof o.at === "string"
              ? o.at
              : typeof o.created_at === "string"
                ? o.created_at
                : typeof o.ts === "string"
                  ? o.ts
                  : null;
          const text =
            typeof o.text === "string"
              ? o.text
              : typeof o.message === "string"
                ? o.message
                : typeof o.body === "string"
                  ? o.body
                  : null;
          if (!at || !text?.trim()) return null;
          return {
            id: `json-obj-${i}`,
            title: "Notatka wewnętrzna",
            at,
            detail: text.trim(),
          } satisfies TimelineEntry;
        }
        return null;
      })
      .filter((x): x is TimelineEntry => x != null);
  }
  return [];
}

export function buildIssueTimeline(issue: TriageIssue): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  pushIf(out, "created", "Utworzono zgłoszenie", issue.created_at);

  if (issue.status === "pending_admin_approval") {
    pushIf(
      out,
      "awaiting-acceptance",
      "Oczekuje na akceptację administratora",
      issue.created_at,
      "Zgłoszenie czeka w kolejce triage.",
    );
  }

  pushIf(out, "started", "Rozpoczęto prace", issue.started_at);

  if (issue.status === "rejected") {
    pushIf(
      out,
      "ended",
      "Odrzucono zgłoszenie",
      issue.resolved_at,
      issue.resolution_notes?.trim() || undefined,
    );
  } else if (issue.status === "cancelled") {
    pushIf(
      out,
      "cancelled-col",
      "Anulowano zlecenie",
      issue.cancelled_at,
      issue.cancel_reason?.trim() || undefined,
    );
  } else {
    pushIf(
      out,
      "ended",
      "Zakończono prace",
      issue.resolved_at,
      issue.resolution_notes?.trim() || undefined,
    );
  }

  pushIf(out, "claimed-col", "Technik podjął zlecenie", issue.claimed_at);
  pushIf(
    out,
    "cancel-req-col",
    "Wniosek o anulowanie",
    issue.cancel_requested_at,
    issue.cancel_request_reason?.trim() || undefined,
  );

  for (const extra of tryParseInternalComments(issue.internal_comments, issue.created_at ?? null)) {
    out.push(extra);
  }

  out.sort((a, b) => parseIso(a.at)! - parseIso(b.at)!);
  return out;
}

const LIFECYCLE_TITLE_PL: Record<IssueLifecycleEventType, string> = {
  claimed: "Technik podjął zlecenie",
  started: "Rozpoczęto prace",
  cancel_requested: "Wniosek o anulowanie",
  cancelled: "Anulowano zlecenie",
  transfer_requested: "Wniosek o cesję do firmy B2B",
  transfer_accepted: "Kontrahent zaakceptował cesję",
  transfer_rejected: "Wniosek o cesję odrzucony",
};

export function mergeIssueTimeline(
  issue: TriageIssue,
  events: IssueLifecycleEvent[] | undefined,
): TimelineEntry[] {
  const base = buildIssueTimeline(issue);
  if (!events?.length) return base;

  const fromEvents: TimelineEntry[] = events.map((e) => ({
    id: `evt-${e.id}`,
    title: LIFECYCLE_TITLE_PL[e.event_type] ?? e.event_type,
    at: e.created_at,
    detail: e.payload.reason?.trim() || undefined,
  }));

  const merged = [...base, ...fromEvents];
  const seen = new Set<string>();
  const deduped: TimelineEntry[] = [];
  for (const row of merged.sort((a, b) => parseIso(a.at)! - parseIso(b.at)!)) {
    const key = `${row.title}|${row.at}|${row.detail ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}
