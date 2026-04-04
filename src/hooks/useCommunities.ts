import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/supabase";

export const communityQueryKeys = {
  all: ["communities"] as const,
  list: (orgId: string) => [...communityQueryKeys.all, "list", orgId] as const,
};

type CommunityRow = Database["public"]["Tables"]["communities"]["Row"];
type CommunityInsert = Database["public"]["Tables"]["communities"]["Insert"];
type CommunityUpdate = Database["public"]["Tables"]["communities"]["Update"];

export function useCommunities(orgId: string | null) {
  return useQuery({
    queryKey: communityQueryKeys.list(orgId ?? "__none__"),
    queryFn: async (): Promise<CommunityRow[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("communities")
        .select("*")
        .eq("org_id", orgId)
        .order("name", { ascending: true });

      if (error) {
        console.error("[useCommunities]", error);
        throw error;
      }
      return data ?? [];
    },
    enabled: orgId !== null && orgId !== "",
  });
}

export function useCreateCommunity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Pick<CommunityInsert, "name" | "nip" | "org_id">) => {
      const insertRow: CommunityInsert = {
        name: payload.name,
        org_id: payload.org_id,
        nip: payload.nip ?? null,
      };

      const { data, error } = await supabase
        .from("communities")
        .insert(insertRow)
        .select("id")
        .single();

      if (error) {
        console.error("[useCreateCommunity]", error);
        throw error;
      }
      return data;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: communityQueryKeys.list(variables.org_id),
      });
    },
  });
}

export function useUpdateCommunity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      id: string;
      orgId: string;
      updates: CommunityUpdate;
    }) => {
      const { id, updates } = args;
      const { error } = await supabase.from("communities").update(updates).eq("id", id);

      if (error) {
        console.error("[useUpdateCommunity]", error);
        throw error;
      }
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: communityQueryKeys.list(variables.orgId),
      });
    },
  });
}
