export type CommunityNameSortDir = "asc" | "desc";

export function filterCommunitiesByName<T extends { name: string }>(
  rows: T[],
  query: string,
): T[] {
  const q = query.trim().toLocaleLowerCase("pl");
  if (!q) return [...rows];
  return rows.filter((row) => row.name.toLocaleLowerCase("pl").includes(q));
}

export function sortCommunitiesByName<T extends { name: string }>(
  rows: T[],
  dir: CommunityNameSortDir | null,
): T[] {
  if (!dir) return rows;
  return [...rows].sort((a, b) => {
    const cmp = a.name.localeCompare(b.name, "pl", { sensitivity: "base" });
    return dir === "asc" ? cmp : -cmp;
  });
}

export function nextCommunityNameSort(
  current: CommunityNameSortDir | null,
): CommunityNameSortDir | null {
  if (current === null) return "asc";
  if (current === "asc") return "desc";
  return null;
}
