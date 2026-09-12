import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import {
  createEstate,
  fetchCommunityEstate,
  fetchEstateMembers,
  inviteEstateCommunity,
  respondEstateInvite,
  searchCommunitiesForEstateInvite,
  withdrawEstateMembership,
  type EstateInviteSearchHit,
} from "@/lib/estateApi";

export const estateQueryKeys = {
  community: (communityId: string) => ["community-estate", communityId] as const,
  members: (estateId: string) => ["estate-members", estateId] as const,
};

export function useCommunityEstate(communityId: string | undefined) {
  return useQuery({
    queryKey: estateQueryKeys.community(communityId ?? ""),
    queryFn: () => fetchCommunityEstate(communityId!),
    enabled: Boolean(communityId),
  });
}

export function useEstateMembers(estateId: string | null | undefined) {
  return useQuery({
    queryKey: estateQueryKeys.members(estateId ?? ""),
    queryFn: () => fetchEstateMembers(estateId!),
    enabled: Boolean(estateId),
  });
}

async function invalidateEstate(queryClient: ReturnType<typeof useQueryClient>, communityId: string, estateId?: string | null) {
  await queryClient.invalidateQueries({ queryKey: estateQueryKeys.community(communityId) });
  if (estateId) {
    await queryClient.invalidateQueries({ queryKey: estateQueryKeys.members(estateId) });
  }
}

export function useCreateEstate(communityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createEstate(name, communityId),
    onSuccess: async () => {
      toast.success("Utworzono osiedle.");
      await invalidateEstate(queryClient, communityId);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Nie udało się utworzyć osiedla.");
    },
  });
}

export function useInviteEstateCommunity(communityId: string, estateId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (targetCommunityId: string) => {
      if (!estateId) throw new Error("Brak osiedla.");
      return inviteEstateCommunity(estateId, targetCommunityId);
    },
    onSuccess: async () => {
      toast.success("Wysłano zaproszenie.");
      await invalidateEstate(queryClient, communityId, estateId);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Nie udało się wysłać zaproszenia.");
    },
  });
}

export function useRespondEstateInvite(communityId: string, estateId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { memberId: string; accept: boolean }) =>
      respondEstateInvite(args.memberId, args.accept),
    onSuccess: async (_data, variables) => {
      toast.success(variables.accept ? "Dołączono do osiedla." : "Odrzucono zaproszenie.");
      await invalidateEstate(queryClient, communityId, estateId);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Nie udało się zapisać decyzji.");
    },
  });
}

export function useWithdrawEstateMembership(communityId: string, estateId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => withdrawEstateMembership(memberId),
    onSuccess: async () => {
      toast.success("Zaktualizowano członkostwo osiedla.");
      await invalidateEstate(queryClient, communityId, estateId);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Nie udało się wypisać z osiedla.");
    },
  });
}

export async function searchEstateInviteHits(
  query: string,
  estateId: string | null
): Promise<EstateInviteSearchHit[]> {
  return searchCommunitiesForEstateInvite(query, estateId);
}
