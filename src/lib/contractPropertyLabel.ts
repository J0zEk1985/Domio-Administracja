export type ContractPropertyLabelSource = {
  location_id?: string | null;
  community_id?: string | null;
  community?: { id?: string | null; name?: string | null } | null;
  location?: {
    name?: string | null;
    address?: string | null;
    communities?:
      | { id?: string | null; name?: string | null }
      | { id?: string | null; name?: string | null }[]
      | null;
  } | null;
};

function trimName(value: string | null | undefined): string {
  const n = value?.trim() ?? "";
  if (!n || n === "—") return "";
  return n;
}

type NestedCommunity = { id?: string | null; name?: string | null };

function nestedLocationCommunityName(communities: NestedCommunity | NestedCommunity[] | null | undefined): string {
  if (!communities) return "";
  if (Array.isArray(communities)) return trimName(communities[0]?.name);
  return trimName(communities.name);
}

function communityName(row: ContractPropertyLabelSource): string {
  return trimName(row.community?.name) || nestedLocationCommunityName(row.location?.communities);
}

function buildingLabel(row: ContractPropertyLabelSource): string {
  return trimName(row.location?.name) || trimName(row.location?.address);
}

export type ContractPropertyDisplay = {
  title: string;
  subtitle: string | null;
  href: string | null;
  sortKey: string;
  searchText: string;
};

/** Wspólnota (jeśli jest) + budynek (nazwa albo adres — budynki często nie mają `name`). */
export function contractPropertyDisplay(row: ContractPropertyLabelSource): ContractPropertyDisplay {
  const community = communityName(row);
  const building = buildingLabel(row);

  let title = "—";
  let subtitle: string | null = null;
  if (community && building && community !== building) {
    title = community;
    subtitle = building;
  } else if (community) {
    title = community;
  } else if (building) {
    title = building;
  }

  const href = row.location_id
    ? `/properties/${row.location_id}`
    : row.community_id
      ? `/communities/${row.community_id}`
      : null;

  const sortKey = [community, building].filter(Boolean).join(" ").toLocaleLowerCase("pl") || title;
  const searchText = [community, building, trimName(row.location?.name), trimName(row.location?.address)]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("pl");

  return { title, subtitle, href, sortKey, searchText };
}
