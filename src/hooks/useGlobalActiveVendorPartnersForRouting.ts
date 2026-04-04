import { useQuery } from "@tanstack/react-query";
import { fetchOrgVendorPartners } from "@/hooks/useVendorPartners";

/**
 * Partners for location routing rules: org-wide active vendors only.
 * Intentionally not scoped by location or property/admin contracts.
 */
export const GLOBAL_ROUTING_VENDOR_PARTNERS_QUERY_KEY = "global-routing-vendor-partners" as const;

export function useGlobalActiveVendorPartnersForRouting(enabled: boolean = true) {
  return useQuery({
    queryKey: [GLOBAL_ROUTING_VENDOR_PARTNERS_QUERY_KEY],
    queryFn: () => fetchOrgVendorPartners({ activeOnly: true }),
    enabled,
    staleTime: 60_000,
  });
}
