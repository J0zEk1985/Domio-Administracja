import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { CommunityResidentPostsSection } from "@/components/communities/CommunityResidentPostsSection";

vi.mock("@/lib/supabase", () => ({
  supabase: { from: vi.fn() },
}));

vi.mock("@/lib/communityResidentPosts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/communityResidentPosts")>(
    "@/lib/communityResidentPosts",
  );
  return {
    ...actual,
    fetchResidentBoard: vi.fn(async () => ({
      posts: [
        {
          id: "post-1",
          title: "Oddam krzesło",
          content: "Treść, którą filtr przepuścił.",
          post_type: "general",
          created_at: "2026-10-08T10:00:00.000Z",
          is_free: true,
          price: null,
          authorName: "Anna Nowak",
          locationName: "Blok A",
        },
      ],
      comments: [
        {
          id: "comment-1",
          postId: "post-1",
          content: "Komentarz do poprawy.",
          created_at: "2026-10-08T11:00:00.000Z",
          authorName: "Jan Kowalski",
        },
      ],
    })),
  };
});

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CommunityResidentPostsSection communityId="community-1" buildingIds={["b1"]} canManage />
    </QueryClientProvider>,
  );
}

describe("CommunityResidentPostsSection", () => {
  it("lets an administrator edit and delete a published resident post and its comment", async () => {
    renderSection();
    expect(await screen.findByText("Oddam krzesło")).toBeVisible();
    expect(screen.getByText("Komentarz do poprawy.")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Edytuj" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Usuń" })).toHaveLength(2);

    act(() => {
      screen.getAllByRole("button", { name: "Edytuj" })[0]?.click();
    });
    expect(await screen.findByRole("heading", { name: "Popraw wpis mieszkańca" })).toBeVisible();
    expect(screen.getByLabelText("Tytuł")).toHaveValue("Oddam krzesło");
    expect(screen.getByLabelText("Treść")).toHaveValue("Treść, którą filtr przepuścił.");
  });
});
