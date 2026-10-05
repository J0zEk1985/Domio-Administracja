import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import { EMERGENCY_TRADES, type CommunityEmergencyProvider } from "@/types/emergencyDuty";

export function emergencyProvidersKey(communityId: string) {
  return ["community-emergency-providers", communityId] as const;
}

export type EmergencyProviderRow = CommunityEmergencyProvider & {
  vendor_name: string | null;
};

export function emergencyTradeLabel(code: string): string {
  return EMERGENCY_TRADES.find((t) => t.code === code)?.label ?? code;
}

export function useCommunityEmergencyProviders(communityId: string | null) {
  return useQuery({
    queryKey: communityId ? emergencyProvidersKey(communityId) : ["community-emergency-providers", "none"],
    enabled: Boolean(communityId),
    queryFn: async (): Promise<EmergencyProviderRow[]> => {
      const { data, error } = await supabase
        .from("community_emergency_providers")
        .select("id, org_id, community_id, location_id, trade_code, trade_category, is_enabled, vendor_partner_id, created_at, updated_at, vendor:vendor_partners(name)")
        .eq("community_id", communityId as string)
        .order("trade_code");
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

export function useSaveEmergencyProvider(communityId: string, orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      trade_code: string;
      is_enabled: boolean;
      vendor_partner_id: string | null;
    }) => {
      if (input.is_enabled && !input.vendor_partner_id) {
        throw new Error("Aby włączyć pogotowie 24h, najpierw wybierz firmę.");
      }

      if (input.vendor_partner_id) {
        const { error: flagErr } = await supabase
          .from("vendor_partners")
          .update({ is_emergency_24h: true })
          .eq("id", input.vendor_partner_id)
          .eq("org_id", orgId);
        if (flagErr) throw flagErr;
      }

      const { data: existing, error: findErr } = await supabase
        .from("community_emergency_providers")
        .select("id")
        .eq("community_id", communityId)
        .eq("trade_code", input.trade_code)
        .maybeSingle();
      if (findErr) throw findErr;

      if (!existing && !input.is_enabled && !input.vendor_partner_id) {
        return;
      }

      if (existing) {
        const { error } = await supabase
          .from("community_emergency_providers")
          .update({
            is_enabled: input.is_enabled,
            vendor_partner_id: input.vendor_partner_id,
            location_id: null,
          })
          .eq("id", existing.id);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from("community_emergency_providers").insert({
        org_id: orgId,
        community_id: communityId,
        location_id: null,
        trade_code: input.trade_code,
        is_enabled: input.is_enabled,
        vendor_partner_id: input.vendor_partner_id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: emergencyProvidersKey(communityId) });
      toast.success("Zapisano ustawienia pogotowia 24h.");
    },
    onError: (err) => {
      console.error("[useSaveEmergencyProvider]", err);
      toast.error(err instanceof Error ? err.message : "Nie udało się zapisać pogotowia 24h.");
    },
  });
}
