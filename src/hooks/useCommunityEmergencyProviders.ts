import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import type { CommunityEmergencyProvider } from "@/types/emergencyDuty";

export function emergencyProvidersKey(communityId: string) {
  return ["community-emergency-providers", communityId] as const;
}

export type EmergencyProviderRow = CommunityEmergencyProvider & {
  vendor_name: string | null;
};

export function useCommunityEmergencyProviders(communityId: string | null) {
  return useQuery({
    queryKey: communityId ? emergencyProvidersKey(communityId) : ["community-emergency-providers", "none"],
    enabled: Boolean(communityId),
    queryFn: async (): Promise<EmergencyProviderRow[]> => {
      const { data, error } = await supabase
        .from("community_emergency_providers")
        .select("id, org_id, community_id, location_id, trade_category, vendor_partner_id, created_at, updated_at, vendor:vendor_partners(name)")
        .eq("community_id", communityId as string)
        .order("trade_category");
      if (error) {
        console.error("[useCommunityEmergencyProviders]", error);
        throw error;
      }
      return ((data ?? []) as unknown as Array<CommunityEmergencyProvider & { vendor: { name: string | null } | null }>).map(
        (row) => ({
          ...row,
          vendor_name: row.vendor?.name ?? null,
        }),
      );
    },
  });
}

export function useUpsertEmergencyProvider(communityId: string, orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      trade_category: string;
      vendor_partner_id: string;
      location_id: string | null;
    }) => {
      const { error: flagErr } = await supabase
        .from("vendor_partners")
        .update({ is_emergency_24h: true })
        .eq("id", input.vendor_partner_id);
      if (flagErr) throw flagErr;

      const { error } = await supabase.from("community_emergency_providers").insert({
        org_id: orgId,
        community_id: communityId,
        location_id: input.location_id,
        trade_category: input.trade_category,
        vendor_partner_id: input.vendor_partner_id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: emergencyProvidersKey(communityId) });
      toast.success("Dodano firmę pogotowia 24h.");
    },
    onError: (err) => {
      console.error("[useUpsertEmergencyProvider]", err);
      toast.error(err instanceof Error ? err.message : "Nie udało się dodać firmy 24h.");
    },
  });
}

export function useDeleteEmergencyProvider(communityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("community_emergency_providers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: emergencyProvidersKey(communityId) });
      toast.success("Usunięto przypisanie pogotowia.");
    },
    onError: (err) => {
      console.error("[useDeleteEmergencyProvider]", err);
      toast.error(err instanceof Error ? err.message : "Nie udało się usunąć przypisania.");
    },
  });
}
