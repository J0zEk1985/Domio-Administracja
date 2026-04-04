import { useQuery } from "@tanstack/react-query";
import { fetchOrgVendorPartners, VENDOR_PARTNERS_QUERY_KEY } from "@/hooks/useVendorPartners";

/**
 * Same dataset as `useVendorPartners` — org-wide partners (shared React Query cache).
 */
export function useGlobalActiveVendorPartnersForRouting(enabled: boolean = true) {
  return useQuery({
    queryKey: [VENDOR_PARTNERS_QUERY_KEY],
    queryFn: fetchOrgVendorPartners,
    enabled,
    staleTime: 60_000,
  });
}
