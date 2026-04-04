import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import type { Database } from "@/types/supabase";

type CommunityRow = Database["public"]["Tables"]["communities"]["Row"];
type CommunityInsert = Database["public"]["Tables"]["communities"]["Insert"];
type CommunityUpdate = Database["public"]["Tables"]["communities"]["Update"];

export const communityQueryKeys = {
  all: ["communities"] as const,
  list: (orgId: string) => [...communityQueryKeys.all, "list", orgId] as const,
  detail: (communityId: string) => [...communityQueryKeys.all, "detail", communityId] as const,
};

export function useCommunity(communityId: string | undefined, orgId: string | null) {
  return useQuery({
    queryKey: communityQueryKeys.detail(communityId ?? ""),
    queryFn: async (): Promise<CommunityRow | null> => {
      if (!communityId || !orgId) return null;
      const { data, error } = await supabase
        .from("communities")
        .select("*")
        .eq("id", communityId)
        .eq("org_id", orgId)
        .maybeSingle();

      if (error) {
        console.error("[useCommunity]", error);
        throw error;
      }
      return data;
    },
    enabled: Boolean(communityId && orgId),
  });
}

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
      const { id, orgId, updates } = args;
      const { error } = await supabase
        .from("communities")
        .update(updates)
        .eq("id", id)
        .eq("org_id", orgId);

      if (error) {
        console.error("[useUpdateCommunity]", error);
        throw error;
      }
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: communityQueryKeys.list(variables.orgId),
      });
      await queryClient.invalidateQueries({
        queryKey: communityQueryKeys.detail(variables.id),
      });
      await queryClient.invalidateQueries({ queryKey: ["properties"] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Nie udało się zapisać danych wspólnoty.";
      toast.error(msg);
      console.error("[useUpdateCommunity]", e);
    },
  });
}
