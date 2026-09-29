import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { CommunityAnnouncementReviewTab } from "@/components/communities/CommunityAnnouncementReviewTab";

vi.mock("@/hooks/useEBoardMessages", () => ({
  useEBoardMessagesForCommunity: () => ({
    data: [],
    isPending: false,
    isError: false,
  }),
  useCreateEBoardMessage: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: () => ({ data: [], isLoading: false, isError: false }),
    useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

function renderTab(canManage = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CommunityAnnouncementReviewTab
        communityId="community-1"
        communityName="Nowe Polesie 3"
        buildingIds={["b1"]}
        buildings={[{ id: "b1", name: "Blok A", address: "Poleska 1" }]}
        canManage={canManage}
      />
    </QueryClientProvider>,
  );
}

describe("CommunityAnnouncementReviewTab", () => {
  it("shows create announcement action like the e-board module", () => {
    renderTab();
    expect(screen.getByRole("heading", { name: "Tablica ogłoszeń" })).toBeVisible();
    expect(screen.getByRole("button", { name: "+ Nowe ogłoszenie" })).toBeVisible();
    expect(screen.getByText("Brak ogłoszeń na tablicy. Dodaj pierwsze przyciskiem powyżej.")).toBeVisible();
  });

  it("hides create action when the community cannot be managed", () => {
    renderTab(false);
    expect(screen.queryByRole("button", { name: "+ Nowe ogłoszenie" })).not.toBeInTheDocument();
  });
});
