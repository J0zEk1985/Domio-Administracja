import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database, Json } from "@/types/supabase";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BoardPortalIssue = {
  id: string;
  category: string | null;
  description: string;
  status: Database["public"]["Enums"]["issue_status_enum"] | null;
  priority: Database["public"]["Enums"]["issue_priority_enum"] | null;
  created_at: string | null;
  emergency_mode: boolean | null;
};

export type BoardPortalTask = {
  id: string;
  title: string;
  status: Database["public"]["Enums"]["property_task_status"];
  priority: Database["public"]["Enums"]["property_task_priority"];
  created_at: string;
};

export type BoardPortalAnnouncement = {
  id: string;
  title: string;
  content: string;
  msg_type: Database["public"]["Enums"]["eboard_msg_type"];
  valid_until: string | null;
  created_at: string | null;
};

export type BoardPortalContact = {
  label: string;
  phone: string | null;
  email: string | null;
  sort_order: number;
};

export type BoardPortalSnapshot = {
  ok: true;
  property: {
    name: string | null;
    address: string | null;
    community_name: string | null;
  };
  issues: BoardPortalIssue[];
  tasks: BoardPortalTask[];
  announcements: BoardPortalAnnouncement[];
  contacts: BoardPortalContact[];
};

export type BoardPortalResult =
  | BoardPortalSnapshot
  | { ok: false; error: "invalid_token" | "not_found" | "bad_response" };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function parseIssues(raw: unknown): BoardPortalIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!isRecord(row) || typeof row.id !== "string") return [];
    return [
      {
        id: row.id,
        category: asString(row.category),
        description: typeof row.description === "string" ? row.description : "",
        status: (asString(row.status) as BoardPortalIssue["status"]) ?? null,
        priority: (asString(row.priority) as BoardPortalIssue["priority"]) ?? null,
        created_at: asString(row.created_at),
        emergency_mode: typeof row.emergency_mode === "boolean" ? row.emergency_mode : null,
      },
    ];
  });
}

function parseTasks(raw: unknown): BoardPortalTask[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.title !== "string") return [];
    const status = asString(row.status) as BoardPortalTask["status"] | null;
    const priority = asString(row.priority) as BoardPortalTask["priority"] | null;
    const created_at = asString(row.created_at);
    if (!status || !priority || !created_at) return [];
    return [{ id: row.id, title: row.title, status, priority, created_at }];
  });
}

function parseAnnouncements(raw: unknown): BoardPortalAnnouncement[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.title !== "string") return [];
    return [
      {
        id: row.id,
        title: row.title,
        content: typeof row.content === "string" ? row.content : "",
        msg_type: (asString(row.msg_type) as BoardPortalAnnouncement["msg_type"]) ?? "official",
        valid_until: asString(row.valid_until),
        created_at: asString(row.created_at),
      },
    ];
  });
}

function parseContacts(raw: unknown): BoardPortalContact[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!isRecord(row) || typeof row.label !== "string") return [];
    return [
      {
        label: row.label,
        phone: asString(row.phone),
        email: asString(row.email),
        sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
      },
    ];
  });
}

function parseSnapshot(data: Json | null): BoardPortalResult {
  if (!isRecord(data)) {
    return { ok: false, error: "bad_response" };
  }
  if (data.ok !== true) {
    const err = asString(data.error);
    if (err === "not_found" || err === "invalid_token") {
      return { ok: false, error: err };
    }
    return { ok: false, error: "not_found" };
  }
  const propertyRaw = data.property;
  const property = isRecord(propertyRaw)
    ? {
        name: asString(propertyRaw.name),
        address: asString(propertyRaw.address),
        community_name: asString(propertyRaw.community_name),
      }
    : { name: null, address: null, community_name: null };

  return {
    ok: true,
    property,
    issues: parseIssues(data.issues),
    tasks: parseTasks(data.tasks),
    announcements: parseAnnouncements(data.announcements),
    contacts: parseContacts(data.contacts),
  };
}

export function isBoardPortalToken(token: string | undefined): token is string {
  return Boolean(token && UUID_RE.test(token));
}

export function useBoardPortal(token: string | undefined) {
  const valid = isBoardPortalToken(token);
  return useQuery({
    queryKey: ["board-portal", token ?? "none"],
    enabled: valid,
    staleTime: 30_000,
    queryFn: async (): Promise<BoardPortalResult> => {
      const { data, error } = await supabase.rpc("get_board_portal_snapshot", {
        p_token: token as string,
      });
      if (error) {
        console.error("[useBoardPortal] get_board_portal_snapshot:", error);
        throw error;
      }
      return parseSnapshot(data);
    },
  });
}
