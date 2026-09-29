import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CommunityBoardDisplayLinkCard } from "@/components/communities/CommunityBoardDisplayLinkCard";

describe("CommunityBoardDisplayLinkCard", () => {
  it("keeps the announcement display and the board portal as two separate views", () => {
    render(
      <CommunityBoardDisplayLinkCard
        communityId="community-1"
        buildings={[{ id: "building-1", name: "Pienista 51", boardPortalToken: "portal-token-1" }]}
      />,
    );

    const displayUrl = screen.getByText(/\/display\/community-1$/);
    const portalUrl = screen.getByText(/\/portal\/board\/portal-token-1$/);

    expect(screen.getByRole("heading", { name: "Tablica ogłoszeń" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Portal Zarządu" })).toBeVisible();
    expect(displayUrl).toBeVisible();
    expect(portalUrl).toBeVisible();
    expect(displayUrl.textContent).not.toContain("/portal/board/");
    expect(portalUrl.textContent).not.toContain("/display/");
  });
});
