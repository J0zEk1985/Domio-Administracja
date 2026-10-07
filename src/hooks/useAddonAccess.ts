import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { AddonModule } from "@/lib/addonPurchase";

type HasModuleAccessClient = {
  rpc: (
    fn: "has_module_access",
    args: { p_org_id: string; p_community_id: string | null; p_module: AddonModule },
  ) => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
};

async function fetchMyOrgId(): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_my_org_id_safe");
  if (error) {
    console.error("[useAddonAccess] get_my_org_id_safe:", error);
    return null;
  }
  if (data == null || String(data).trim() === "") return null;
  return String(data);
}

export function useAddonAccess(module: AddonModule, communityId?: string | null) {
  const orgQuery = useQuery({
    queryKey: ["my-org-id"],
    queryFn: fetchMyOrgId,
  });

  const orgId = orgQuery.data ?? null;
  const scopedCommunityId = module === "developer_warranty" ? null : (communityId ?? null);
  const enabled = Boolean(orgId) && (module === "developer_warranty" || Boolean(scopedCommunityId));

  const accessQuery = useQuery({
    queryKey: ["addon-access", module, orgId, scopedCommunityId],
    enabled,
    queryFn: async () => {
      const client = supabase as unknown as HasModuleAccessClient;
      const { data, error } = await client.rpc("has_module_access", {
        p_org_id: orgId as string,
        p_community_id: scopedCommunityId,
        p_module: module,
      });
      if (error) {
        console.error("[useAddonAccess] has_module_access:", error.message);
        return false;
      }
      return data === true;
    },
  });

  return {
    isLoading: orgQuery.isLoading || (enabled && accessQuery.isLoading),
    isActive: accessQuery.data === true,
  };
}
