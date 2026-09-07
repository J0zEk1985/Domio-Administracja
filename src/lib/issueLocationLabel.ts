export type IssueLocationLabelSource = {
  name?: string | null;
  address?: string | null;
} | null | undefined;

/** Prefer display name; Cleaning/Serwis buildings often have only `address`. */
export function formatIssueBuildingLabel(location: IssueLocationLabelSource): string {
  const name = location?.name?.trim() ?? "";
  const address = location?.address?.trim() ?? "";
  if (name && address && name !== address) return `${name} · ${address}`;
  return name || address || "Budynek bez nazwy";
}
