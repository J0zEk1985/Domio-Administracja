import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import { deactivateCommunityForOrg, LegalEntityApiError } from "@/lib/legalEntityApi";
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

export function useCommunities(
  orgId: string | null,
  options?: { enabled?: boolean; staleTime?: number },
) {
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
    enabled: (options?.enabled ?? true) && orgId !== null && orgId !== "",
    staleTime: options?.staleTime,
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

export function useDeactivateCommunity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: { orgId: string; communityId: string }) => {
      return deactivateCommunityForOrg(args.orgId, args.communityId);
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: communityQueryKeys.list(variables.orgId),
      });
      await queryClient.invalidateQueries({
        queryKey: communityQueryKeys.detail(variables.communityId),
      });
      await queryClient.invalidateQueries({ queryKey: ["properties"] });
      await queryClient.invalidateQueries({ queryKey: ["community-locations"] });
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof LegalEntityApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Nie udało się dezaktywować wspólnoty.";
      toast.error(msg);
      console.error("[useDeactivateCommunity]", e);
    },
  });
}

export function useRotateCommunityBoardToken(communityId: string | undefined, orgId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<string> => {
      if (!communityId?.trim() || !orgId?.trim()) {
        throw new Error("Brak identyfikatora wspólnoty.");
      }
      const { data, error } = await supabase.rpc("rotate_community_board_portal_token", {
        p_community_id: communityId,
      });
      if (error) {
        console.error("[useRotateCommunityBoardToken] rpc:", error);
        throw error;
      }
      const token = typeof data === "string" ? data.trim() : "";
      if (!token) {
        throw new Error("Serwer nie zwrócił nowego tokenu portalu Zarządu.");
      }
      return token;
    },
    onSuccess: async () => {
      if (communityId) {
        await queryClient.invalidateQueries({ queryKey: communityQueryKeys.detail(communityId) });
      }
      if (orgId) {
        await queryClient.invalidateQueries({ queryKey: communityQueryKeys.list(orgId) });
      }
      toast.success("Wygenerowano nowy link portalu Zarządu.");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Nie udało się zresetować linku.";
      toast.error(msg);
      console.error("[useRotateCommunityBoardToken]", err);
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
