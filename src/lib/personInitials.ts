/** Two-letter initials for avatar fallback (Latin script). */
export function personInitialsFromName(name: string | null | undefined): string {
  const n = name?.trim() ?? "";
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  const a = parts[0]![0] ?? "";
  const b = parts[parts.length - 1]![0] ?? "";
  return `${a}${b}`.toUpperCase() || "?";
}
