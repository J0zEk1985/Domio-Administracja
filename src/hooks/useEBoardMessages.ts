import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import type { Database } from "@/types/supabase";

type EBoardRow = Database["public"]["Tables"]["e_board_messages"]["Row"];
type EBoardInsert = Database["public"]["Tables"]["e_board_messages"]["Insert"];
type EBoardUpdate = Database["public"]["Tables"]["e_board_messages"]["Update"];

export type EBoardMessageListItem = EBoardRow & {
  communities: { name: string | null } | null;
  cleaning_locations: { name: string | null } | null;
};

export const eBoardMessagesQueryKey = (orgId: string) => ["e-board-messages", orgId] as const;

export const eBoardDisplayQueryKey = (communityId: string) =>
  ["e-board-display", communityId] as const;

export type EBoardDisplayItem = Pick<
  EBoardRow,
  "id" | "title" | "content" | "msg_type" | "valid_until" | "display_from" | "display_until" | "created_at"
>;

/** Public kiosk: active published messages for a community (RLS must allow anon read). */
async function fetchEBoardMessagesForDisplay(communityId: string): Promise<EBoardDisplayItem[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("e_board_messages")
    .select("id, title, content, msg_type, valid_until, display_from, display_until, created_at")
    .eq("community_id", communityId)
    .eq("status", "published")
    .eq("is_active", true)
    .or(`valid_until.is.null,valid_until.gte.${today}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fetchEBoardMessagesForDisplay]", error);
    throw error;
  }
  return (data ?? []) as EBoardDisplayItem[];
}

export function useEBoardMessagesForDisplay(communityId: string | undefined) {
  return useQuery({
    queryKey: communityId ? eBoardDisplayQueryKey(communityId) : ["e-board-display", "none"],
    queryFn: () => fetchEBoardMessagesForDisplay(communityId!),
    enabled: Boolean(communityId && communityId.trim() !== ""),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return fallback;
}

async function fetchEBoardMessages(orgId: string): Promise<EBoardMessageListItem[]> {
  const { data, error } = await supabase
    .from("e_board_messages")
    .select(
      `
      *,
      communities ( name ),
      cleaning_locations ( name )
    `,
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fetchEBoardMessages]", error);
    throw error;
  }
  return (data ?? []) as EBoardMessageListItem[];
}

export function useEBoardMessages(orgId: string | null) {
  return useQuery({
    queryKey: eBoardMessagesQueryKey(orgId ?? "__none__"),
    queryFn: () => fetchEBoardMessages(orgId!),
    enabled: Boolean(orgId && orgId.trim() !== ""),
  });
}

export type CreateEBoardMessageInput = {
  title: string;
  content: string;
  msg_type: Database["public"]["Enums"]["eboard_msg_type"];
  community_id: string;
  location_id: string | null;
  valid_until: string | null;
};

export function useCreateEBoardMessage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateEBoardMessageInput) => {
      const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
      if (orgErr) {
        console.error("[useCreateEBoardMessage] get_my_org_id_safe:", orgErr);
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
        console.error("[useCreateEBoardMessage] getUser:", userErr);
        throw userErr;
      }
      if (!user?.id) {
        throw new Error("Musisz być zalogowany, aby dodać ogłoszenie.");
      }

      const row: EBoardInsert = {
        org_id: String(orgId),
        title: input.title.trim(),
        content: input.content.trim(),
        msg_type: input.msg_type,
        community_id: input.community_id,
        location_id: input.location_id,
        valid_until: input.valid_until,
        status: "published",
        is_active: true,
        created_by: user.id,
      };

      const { error } = await supabase.from("e_board_messages").insert(row);

      if (error) {
        console.error("[useCreateEBoardMessage] insert:", error);
        throw error;
      }
    },
    onSuccess: async () => {
      const { data: orgId } = await supabase.rpc("get_my_org_id_safe");
      if (orgId) {
        await qc.invalidateQueries({ queryKey: eBoardMessagesQueryKey(String(orgId)) });
      }
      toast.success("Ogłoszenie zostało dodane.");
    },
    onError: (err: unknown) => {
      toast.error(errMessage(err, "Nie udało się dodać ogłoszenia."));
      console.error("[useCreateEBoardMessage]", err);
    },
  });
}

export type UpdateEBoardMessageInput = {
  id: string;
  updates: Pick<
    EBoardUpdate,
    | "title"
    | "content"
    | "msg_type"
    | "community_id"
    | "location_id"
    | "valid_until"
    | "status"
    | "is_active"
  >;
};

export function useUpdateEBoardMessage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateEBoardMessageInput) => {
      const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
      if (orgErr) {
        console.error("[useUpdateEBoardMessage] get_my_org_id_safe:", orgErr);
        throw orgErr;
      }
      if (!orgId || String(orgId).trim() === "") {
        throw new Error("Brak kontekstu organizacji.");
      }

      const { error } = await supabase
        .from("e_board_messages")
        .update(input.updates)
        .eq("id", input.id)
        .eq("org_id", String(orgId));

      if (error) {
        console.error("[useUpdateEBoardMessage] update:", error);
        throw error;
      }
    },
    onSuccess: async () => {
      const { data: orgId } = await supabase.rpc("get_my_org_id_safe");
      if (orgId) {
        await qc.invalidateQueries({ queryKey: eBoardMessagesQueryKey(String(orgId)) });
      }
      toast.success("Zapisano zmiany.");
    },
    onError: (err: unknown) => {
      toast.error(errMessage(err, "Nie udało się zapisać ogłoszenia."));
      console.error("[useUpdateEBoardMessage]", err);
    },
  });
}
