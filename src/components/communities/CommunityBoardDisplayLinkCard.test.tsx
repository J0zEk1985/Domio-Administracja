import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { CommunityBoardDisplayLinkCard } from "@/components/communities/CommunityBoardDisplayLinkCard";

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CommunityBoardDisplayLinkCard
        communityId="community-1"
        orgId="org-1"
        boardPortalToken="portal-token-1"
        canManage
      />
    </QueryClientProvider>,
  );
}

describe("CommunityBoardDisplayLinkCard", () => {
  it("keeps the announcement display and a single community board portal as two separate views", () => {
    renderCard();

    const displayUrl = screen.getByText(/\/display\/community-1$/);
    const portalUrl = screen.getByText(/\/portal\/board\/portal-token-1$/);

    expect(screen.getByRole("heading", { name: "Tablica ogłoszeń" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Portal Zarządu" })).toBeVisible();
    expect(displayUrl).toBeVisible();
    expect(portalUrl).toBeVisible();
    expect(displayUrl.textContent).not.toContain("/portal/board/");
    expect(portalUrl.textContent).not.toContain("/display/");
    expect(screen.queryByText(/Pienista/)).not.toBeInTheDocument();
  });
});
