import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CommunityDomainEditor } from "@/components/communities/CommunityDomainEditor";
import type { Database } from "@/types/supabase";

type CommunityRow = Database["public"]["Tables"]["communities"]["Row"];

const community: CommunityRow = {
  access_codes: {},
  board_email: null,
  board_members: [],
  board_portal_token: "portal-token-1",
  created_at: "2026-01-01T00:00:00Z",
  deactivated_at: null,
  deactivated_by: null,
  financial_details: {},
  id: "community-1",
  legal_name: "Wspólnota testowa",
  name: "Test",
  nip: null,
  operational_notes: {},
  org_id: "org-1",
  regon: null,
  status: "active",
  updated_at: "2026-01-01T00:00:00Z",
};

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CommunityDomainEditor
        community={community}
        orgId="org-1"
        coreExtra={<p>Dostęp zewnętrzny</p>}
        homeBoard={<p>Tablica mieszkańca (Home)</p>}
      />
    </QueryClientProvider>,
  );
}

describe("CommunityDomainEditor", () => {
  it("shows external links on Podstawowe and keeps resident board on a separate Tablica Home tab", () => {
    renderEditor();

    expect(screen.getByRole("tab", { name: "Podstawowe" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Tablica Home" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("Dostęp zewnętrzny")).toBeVisible();
    expect(screen.queryByText("Tablica mieszkańca (Home)")).not.toBeInTheDocument();
  });
});
