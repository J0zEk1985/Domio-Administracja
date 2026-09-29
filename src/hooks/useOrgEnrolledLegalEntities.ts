import { useQuery } from "@tanstack/react-query";
import {
  listOrgEnrolledLegalEntities,
  ORG_LEGAL_ENTITIES_ROOT,
  type LegalEntityKind,
  type LegalEntityPublic,
} from "@/lib/legalEntityApi";

export function orgLegalEntitiesKey(orgId: string) {
  return [ORG_LEGAL_ENTITIES_ROOT, "list", orgId] as const;
}

export function useOrgEnrolledLegalEntities(
  orgId: string | null,
  allowedKinds?: LegalEntityKind[],
) {
  return useQuery({
    queryKey: orgLegalEntitiesKey(orgId ?? "__none__"),
    queryFn: async (): Promise<LegalEntityPublic[]> => {
      if (!orgId) return [];
      return listOrgEnrolledLegalEntities(orgId);
    },
    enabled: Boolean(orgId),
    staleTime: 30_000,
    select: (rows) => {
      if (!allowedKinds || allowedKinds.length === 0) return rows;
      return rows.filter((row) => allowedKinds.includes(row.kind));
    },
  });
}
