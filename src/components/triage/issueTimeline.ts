import type { Json } from "@/types/supabase";
import type { TriageIssue } from "@/hooks/useTriageIssues";

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
  pushIf(out, "started", "Rozpoczęto", issue.started_at);
  pushIf(out, "scheduled", "Zaplanowano", issue.scheduled_at);
  pushIf(out, "resolved", "Rozwiązano", issue.resolved_at);

  for (const extra of tryParseInternalComments(issue.internal_comments, issue.created_at ?? null)) {
    out.push(extra);
  }

  out.sort((a, b) => parseIso(a.at)! - parseIso(b.at)!);
  return out;
}
