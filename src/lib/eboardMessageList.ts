import type { EBoardMessageListItem } from "@/hooks/useEBoardMessages";
import type { Database } from "@/types/supabase";

type EboardMsgType = Database["public"]["Enums"]["eboard_msg_type"];
type EboardMsgStatus = Database["public"]["Enums"]["eboard_msg_status"];

export const EBOARD_SORT_KEYS = [
  "created_desc",
  "created_asc",
  "title_asc",
  "title_desc",
  "valid_until_asc",
  "valid_until_desc",
  "type",
  "status",
] as const;

export type EBoardSortKey = (typeof EBOARD_SORT_KEYS)[number];

export const EBOARD_SORT_LABELS: Record<EBoardSortKey, string> = {
  created_desc: "Najnowsze",
  created_asc: "Najstarsze",
  title_asc: "Tytuł A–Z",
  title_desc: "Tytuł Z–A",
  valid_until_asc: "Ważne do (rosnąco)",
  valid_until_desc: "Ważne do (malejąco)",
  type: "Typ",
  status: "Status",
};

const TYPE_LABEL: Record<EboardMsgType, string> = {
  official: "Oficjalne",
  advertisement: "Reklama",
  resident: "Mieszkaniec",
};

const STATUS_LABEL: Record<EboardMsgStatus, string> = {
  published: "Opublikowane",
  pending_moderation: "Oczekuje",
  archived: "Zarchiwizowane",
};

const TYPE_ORDER: Record<EboardMsgType, number> = {
  official: 0,
  advertisement: 1,
  resident: 2,
};

const STATUS_ORDER: Record<EboardMsgStatus, number> = {
  pending_moderation: 0,
  published: 1,
  archived: 2,
};

function typeLabel(t: EboardMsgType): string {
  return TYPE_LABEL[t] ?? t;
}

function statusLabel(s: EboardMsgStatus): string {
  return STATUS_LABEL[s] ?? s;
}

function scopeText(row: EBoardMessageListItem): string {
  const building = row.cleaning_locations?.name?.trim() ?? "";
  const community = row.communities?.name?.trim() ?? "";
  return `${building} ${community}`;
}

function parseTime(value: string | null | undefined): number {
  if (!value?.trim()) return Number.POSITIVE_INFINITY;
  const t = Date.parse(value);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

export function filterEBoardMessages(
  rows: EBoardMessageListItem[],
  query: string,
): EBoardMessageListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const haystack = [
      row.title ?? "",
      row.content ?? "",
      scopeText(row),
      typeLabel(row.msg_type),
      statusLabel(row.status),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function sortEBoardMessages(
  rows: EBoardMessageListItem[],
  key: EBoardSortKey,
): EBoardMessageListItem[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    switch (key) {
      case "created_asc":
        return parseTime(a.created_at) - parseTime(b.created_at);
      case "created_desc":
        return parseTime(b.created_at) - parseTime(a.created_at);
      case "title_asc":
        return (a.title ?? "").localeCompare(b.title ?? "", "pl", { sensitivity: "base" });
      case "title_desc":
        return (b.title ?? "").localeCompare(a.title ?? "", "pl", { sensitivity: "base" });
      case "valid_until_asc":
        return parseTime(a.valid_until) - parseTime(b.valid_until);
      case "valid_until_desc": {
        const va = parseTime(a.valid_until);
        const vb = parseTime(b.valid_until);
        const aMissing = !Number.isFinite(va);
        const bMissing = !Number.isFinite(vb);
        if (aMissing && bMissing) return 0;
        if (aMissing) return 1;
        if (bMissing) return -1;
        return vb - va;
      }
      case "type":
        return (TYPE_ORDER[a.msg_type] ?? 99) - (TYPE_ORDER[b.msg_type] ?? 99);
      case "status":
        return (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
      default:
        return 0;
    }
  });
  return copy;
}

export function applyEBoardMessageList(
  rows: EBoardMessageListItem[],
  query: string,
  sortKey: EBoardSortKey,
): EBoardMessageListItem[] {
  return sortEBoardMessages(filterEBoardMessages(rows, query), sortKey);
}
