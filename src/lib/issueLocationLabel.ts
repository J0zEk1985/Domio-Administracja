export type IssueLocationLabelSource = {
  name?: string | null;
  address?: string | null;
} | null | undefined;

export type IssueCommunityEmbed =
  | { id?: string | null; name?: string | null }
  | { id?: string | null; name?: string | null }[]
  | null
  | undefined;

export type IssuePlaceLabels = {
  buildingName: string;
  communityId: string | null;
  communityName: string | null;
};

/** Prefer display name; Cleaning/Serwis buildings often have only `address`. */
export function formatIssueBuildingLabel(location: IssueLocationLabelSource): string {
  const name = location?.name?.trim() ?? "";
  const address = location?.address?.trim() ?? "";
  if (name && address && name !== address) return `${name} · ${address}`;
  return name || address || "Budynek bez nazwy";
}

/** Building line plus wspólnota. Buildings in Administracja often have a null `name`. */
export function formatIssuePlaceLabels(
  location: (IssueLocationLabelSource & { community?: IssueCommunityEmbed }) | null | undefined,
): IssuePlaceLabels {
  const community = Array.isArray(location?.community) ? location.community[0] : location?.community;
  const communityId = community?.id?.trim() || null;
  const communityName = community?.name?.trim() || null;
  return {
    buildingName: formatIssueBuildingLabel(location),
    communityId,
    communityName,
  };
}
