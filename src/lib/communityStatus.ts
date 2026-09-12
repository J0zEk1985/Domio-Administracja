export function isCommunityInactive(status: string | null | undefined): boolean {
  return (status ?? "").toLowerCase() === "inactive";
}

export function formatCommunityStatus(status: string | null | undefined): string {
  if (status === null || status === undefined || status === "") return "—";
  const s = status.toLowerCase();
  if (s === "active") return "Aktywna";
  if (s === "inactive") return "Nieaktywna";
  if (s === "archived") return "Nieaktywna";
  return status;
}
