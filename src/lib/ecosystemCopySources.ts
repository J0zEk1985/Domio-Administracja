import { propertyDisplayName } from "@/hooks/useProperties";

export type EcosystemCopyCandidate = {
  id: string;
  name: string;
  address: string;
  communityId: string | null;
  communityName: string | null;
  locationMasterId: string | null;
};

export function ecosystemCopySourceLabel(row: EcosystemCopyCandidate): string {
  const place = propertyDisplayName(row.name) ?? (row.address.trim() || "Budynek");
  const community = row.communityName?.trim() || "Bez wspólnoty";
  return `${place} · ${community}`;
}

/**
 * Buildings this org administers, except the current address.
 * Community is not a filter: a source may belong to another community.
 */
export function ecosystemCopySources(
  rows: EcosystemCopyCandidate[],
  currentLocationMasterId: string,
): EcosystemCopyCandidate[] {
  const seen = new Set<string>();
  const sources: EcosystemCopyCandidate[] = [];

  for (const row of rows) {
    const masterId = row.locationMasterId;
    if (!masterId || masterId === currentLocationMasterId || seen.has(masterId)) {
      continue;
    }
    seen.add(masterId);
    sources.push(row);
  }

  sources.sort((a, b) => ecosystemCopySourceLabel(a).localeCompare(ecosystemCopySourceLabel(b), "pl"));
  return sources;
}
