import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import {
  acceptServiceMandate,
  declineServiceMandate,
  fetchOrgAdminLegalEntityId,
  inviteServiceMandate,
  listCooperationLinks,
  listLocationModulePresence,
  listServiceMandates,
  revokeServiceMandate,
  upsertBuildingCooperationLink,
} from "@/lib/mandateApi";
import { fetchCommunityLegalEntityId } from "@/lib/legalEntityApi";
import type { DomioModule, MandateRole } from "@/types/mandates";

export const ecosystemQueryKeys = {
  presence: (masterId: string) => ["location-presence", masterId] as const,
  mandates: (entityId: string) => ["service-mandates", entityId] as const,
  coop: (masterId: string) => ["cooperation-links", masterId] as const,
};

export function useLocationPresence(locationMasterId: string | null) {
  return useQuery({
    queryKey: ecosystemQueryKeys.presence(locationMasterId ?? ""),
    queryFn: () => listLocationModulePresence(locationMasterId!),
    enabled: Boolean(locationMasterId),
  });
}

export function useServiceMandates(communityLegalEntityId: string | null) {
  return useQuery({
    queryKey: ecosystemQueryKeys.mandates(communityLegalEntityId ?? ""),
    queryFn: () => listServiceMandates(communityLegalEntityId!),
    enabled: Boolean(communityLegalEntityId),
  });
}

export function useCooperationLinks(locationMasterId: string | null) {
  return useQuery({
    queryKey: ecosystemQueryKeys.coop(locationMasterId ?? ""),
    queryFn: () => listCooperationLinks(locationMasterId!),
    enabled: Boolean(locationMasterId),
  });
}

export function useCommunityLegalEntityId(communityId: string | null) {
  return useQuery({
    queryKey: ["community-legal-entity-id", communityId ?? ""],
    queryFn: () => fetchCommunityLegalEntityId(communityId!),
    enabled: Boolean(communityId),
  });
}

export function useOrgAdminLegalEntityId(orgId: string | null) {
  return useQuery({
    queryKey: ["org-admin-legal-entity", orgId ?? ""],
    queryFn: () => fetchOrgAdminLegalEntityId(orgId!),
    enabled: Boolean(orgId),
  });
}

export function useInviteMandate(communityLegalEntityId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      actingOrgId: string;
      locationMasterId: string | null;
      partnerOrgId: string | null;
      partnerLegalEntityId: string;
      module: DomioModule;
      role: MandateRole;
    }) =>
      inviteServiceMandate({
        ...args,
        communityLegalEntityId: communityLegalEntityId!,
      }),
    onSuccess: () => {
      toast.success("Mandat zapisany.");
      if (communityLegalEntityId) {
        void qc.invalidateQueries({ queryKey: ecosystemQueryKeys.mandates(communityLegalEntityId) });
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Nie udało się zapisać mandatu.");
    },
  });
}

export function useMandateActions(communityLegalEntityId: string | null) {
  const qc = useQueryClient();
  const invalidate = () => {
    if (communityLegalEntityId) {
      void qc.invalidateQueries({ queryKey: ecosystemQueryKeys.mandates(communityLegalEntityId) });
    }
  };
  const accept = useMutation({
    mutationFn: (args: { actingOrgId: string; mandateId: string }) =>
      acceptServiceMandate(args.actingOrgId, args.mandateId),
    onSuccess: () => {
      toast.success("Mandat zaakceptowany.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Błąd akceptacji."),
  });
  const decline = useMutation({
    mutationFn: (args: { actingOrgId: string; mandateId: string }) =>
      declineServiceMandate(args.actingOrgId, args.mandateId),
    onSuccess: () => {
      toast.success("Zaproszenie odrzucone.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Błąd odrzucenia."),
  });
  const revoke = useMutation({
    mutationFn: (args: { actingOrgId: string; mandateId: string }) =>
      revokeServiceMandate(args.actingOrgId, args.mandateId),
    onSuccess: () => {
      toast.success("Mandat zakończony.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Błąd zakończenia mandatu."),
  });
  return { accept, decline, revoke };
}

export function useUpsertCooperation(locationMasterId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: upsertBuildingCooperationLink,
    onSuccess: () => {
      toast.success("Zapisano kooperację Cleaning i Serwis.");
      if (locationMasterId) {
        void qc.invalidateQueries({ queryKey: ecosystemQueryKeys.coop(locationMasterId) });
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Nie udało się zapisać kooperacji.");
    },
  });
}
