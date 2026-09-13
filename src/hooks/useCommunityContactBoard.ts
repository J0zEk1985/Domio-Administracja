import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import type { CommunityContactBoardEntry } from "@/types/emergencyDuty";

export function communityContactBoardKey(communityId: string) {
  return ["community-contact-board", communityId] as const;
}

export function useCommunityContactBoard(communityId: string | null) {
  return useQuery({
    queryKey: communityId ? communityContactBoardKey(communityId) : ["community-contact-board", "none"],
    enabled: Boolean(communityId),
    queryFn: async (): Promise<CommunityContactBoardEntry[]> => {
      const { data, error } = await supabase
        .from("community_contact_board_entries")
        .select("id, org_id, community_id, label, phone, email, sort_order, created_at, updated_at, updated_by")
        .eq("community_id", communityId as string)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) {
        console.error("[useCommunityContactBoard]", error);
        throw error;
      }
      return (data ?? []) as unknown as CommunityContactBoardEntry[];
    },
  });
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Operacja na tablicy nie powiodła się.";
}

export function useSaveContactBoardEntry(communityId: string, orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      label: string;
      phone: string | null;
      email: string | null;
      sort_order: number;
    }) => {
      if (input.id) {
        const { error } = await supabase
          .from("community_contact_board_entries")
          .update({
            label: input.label,
            phone: input.phone,
            email: input.email,
            sort_order: input.sort_order,
          })
          .eq("id", input.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("community_contact_board_entries").insert({
        org_id: orgId,
        community_id: communityId,
        label: input.label,
        phone: input.phone,
        email: input.email,
        sort_order: input.sort_order,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: communityContactBoardKey(communityId) });
      toast.success("Zapisano pozycję tablicy.");
    },
    onError: (err) => {
      console.error("[useSaveContactBoardEntry]", err);
      toast.error(errMsg(err));
    },
  });
}

export function useDeleteContactBoardEntry(communityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("community_contact_board_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: communityContactBoardKey(communityId) });
      toast.success("Usunięto pozycję.");
    },
    onError: (err) => {
      console.error("[useDeleteContactBoardEntry]", err);
      toast.error(errMsg(err));
    },
  });
}
