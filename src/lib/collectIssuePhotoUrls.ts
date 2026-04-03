import type { Database } from "@/types/supabase";

type IssueRow = Database["public"]["Tables"]["property_issues"]["Row"];

export type IssuePhotoEntry = {
  url: string;
  label: string;
};

function pushUnique(out: IssuePhotoEntry[], url: string | null | undefined, label: string): void {
  const u = url?.trim();
  if (!u) return;
  if (out.some((e) => e.url === u)) return;
  out.push({ url: u, label });
}

/**
 * Primary report + before/after arrays for Proof of Work gallery.
 */
export function collectIssuePhotoEntries(issue: IssueRow): IssuePhotoEntry[] {
  const out: IssuePhotoEntry[] = [];
  pushUnique(out, issue.photo_url, "Zgłoszenie");
  for (let i = 0; i < (issue.photos_before?.length ?? 0); i++) {
    pushUnique(out, issue.photos_before?.[i] ?? null, `Przed ${i + 1}`);
  }
  for (let i = 0; i < (issue.photos_after?.length ?? 0); i++) {
    pushUnique(out, issue.photos_after?.[i] ?? null, `Po ${i + 1}`);
  }
  return out;
}
