/**
 * Maps `memberships.role` (and aliases) to Polish labels for the admin UI.
 * DB may use owner / coordinator / cleaner (see org constraints) or extended roles.
 */
export function mapMembershipRoleToPolish(role: string): string {
  const r = role.trim().toLowerCase();
  const map: Record<string, string> = {
    owner: "Właściciel",
    coordinator: "Administrator",
    admin: "Administrator",
    administrator: "Administrator",
    assistant: "Asystent",
    accountant: "Księgowa",
    bookkeeper: "Księgowa",
    cleaner: "Pracownik",
  };
  if (map[r]) return map[r];
  if (!r) return "—";
  return role;
}
