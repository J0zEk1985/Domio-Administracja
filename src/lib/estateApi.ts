import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/supabase";

export type EstateMemberStatus = Database["public"]["Enums"]["estate_member_status"];

export type CommunityEstate = {
  estateId: string;
  estateName: string;
  estateStatus: string;
  createdByOrgId: string;
  memberId: string;
  memberStatus: EstateMemberStatus;
  invitedByOrgId: string;
  consentedAt: string | null;
};

export type EstateMember = {
  memberId: string;
  communityId: string;
  orgId: string;
  status: EstateMemberStatus;
  communityName: string;
  nip: string | null;
  invitedByOrgId: string;
  consentedAt: string | null;
  isOwn: boolean;
};

export type EstateInviteSearchHit = {
  communityId: string;
  displayName: string;
  nip: string | null;
  isOwn: boolean;
  linkStatus: EstateMemberStatus | null;
};

function rpcMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    const msg = (err as { message: string }).message.trim();
    if (msg) return msg;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

export async function fetchCommunityEstate(communityId: string): Promise<CommunityEstate | null> {
  const { data, error } = await supabase.rpc("get_community_estate", {
    p_community_id: communityId,
  });
  if (error) {
    console.error("[fetchCommunityEstate]", error);
    throw new Error(rpcMessage(error, "Nie udało się wczytać osiedla."));
  }
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    estateId: row.estate_id,
    estateName: row.estate_name,
    estateStatus: row.estate_status,
    createdByOrgId: row.created_by_org_id,
    memberId: row.member_id,
    memberStatus: row.member_status,
    invitedByOrgId: row.invited_by_org_id,
    consentedAt: row.consented_at ?? null,
  };
}

export async function fetchEstateMembers(estateId: string): Promise<EstateMember[]> {
  const { data, error } = await supabase.rpc("list_estate_members", {
    p_estate_id: estateId,
  });
  if (error) {
    console.error("[fetchEstateMembers]", error);
    throw new Error(rpcMessage(error, "Nie udało się wczytać członków osiedla."));
  }
  return (data ?? []).map((row) => ({
    memberId: row.member_id,
    communityId: row.community_id,
    orgId: row.org_id,
    status: row.status,
    communityName: row.community_name,
    nip: row.nip ?? null,
    invitedByOrgId: row.invited_by_org_id,
    consentedAt: row.consented_at ?? null,
    isOwn: row.is_own,
  }));
}

export async function createEstate(name: string, communityId: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_estate", {
    p_name: name,
    p_community_id: communityId,
  });
  if (error) {
    console.error("[createEstate]", error);
    throw new Error(rpcMessage(error, "Nie udało się utworzyć osiedla."));
  }
  if (!data) {
    throw new Error("Nie udało się utworzyć osiedla.");
  }
  return String(data);
}

export async function inviteEstateCommunity(estateId: string, communityId: string): Promise<void> {
  const { error } = await supabase.rpc("invite_estate_community", {
    p_estate_id: estateId,
    p_community_id: communityId,
  });
  if (error) {
    console.error("[inviteEstateCommunity]", error);
    throw new Error(rpcMessage(error, "Nie udało się wysłać zaproszenia."));
  }
}

export async function respondEstateInvite(memberId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc("respond_estate_invite", {
    p_member_id: memberId,
    p_accept: accept,
  });
  if (error) {
    console.error("[respondEstateInvite]", error);
    throw new Error(rpcMessage(error, "Nie udało się zapisać decyzji."));
  }
}

export async function withdrawEstateMembership(memberId: string): Promise<void> {
  const { error } = await supabase.rpc("withdraw_estate_membership", {
    p_member_id: memberId,
  });
  if (error) {
    console.error("[withdrawEstateMembership]", error);
    throw new Error(rpcMessage(error, "Nie udało się wypisać z osiedla."));
  }
}

export async function searchCommunitiesForEstateInvite(
  query: string,
  estateId: string | null
): Promise<EstateInviteSearchHit[]> {
  const { data, error } = await supabase.rpc("search_communities_for_estate_invite", {
    p_query: query,
    p_estate_id: estateId,
  });
  if (error) {
    console.error("[searchCommunitiesForEstateInvite]", error);
    throw new Error(rpcMessage(error, "Nie udało się wyszukać wspólnot."));
  }
  return (data ?? []).map((row) => ({
    communityId: row.community_id,
    displayName: row.display_name,
    nip: row.nip ?? null,
    isOwn: row.is_own,
    linkStatus: row.link_status ?? null,
  }));
}
