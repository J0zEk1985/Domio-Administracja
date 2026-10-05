export type ProfileDisplaySource = {
  full_name?: string | null;
  email?: string | null;
  contact_email?: string | null;
};

function trimOrEmpty(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/** Prefer full name; otherwise show a contact email so staff comments are identifiable. */
export function profileDisplayName(
  profile: ProfileDisplaySource | ProfileDisplaySource[] | null | undefined,
  fallback: string,
): string {
  const row = Array.isArray(profile) ? profile[0] : profile;
  if (!row) return fallback;
  return (
    trimOrEmpty(row.full_name) ||
    trimOrEmpty(row.email) ||
    trimOrEmpty(row.contact_email) ||
    fallback
  );
}

export function firstProfileEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
