import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import Communities from "@/pages/Communities";

const rows = [
  {
    id: "c-polesie",
    name: "NOWE POLESIE 3",
    nip: "5482694711",
    status: "active",
    created_at: "2026-10-05T10:00:00Z",
  },
  {
    id: "c-alfa",
    name: "Alfa Park",
    nip: "1111111111",
    status: "active",
    created_at: "2026-09-01T10:00:00Z",
  },
];

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: (opts: { queryKey?: unknown }) => {
      const key = Array.isArray(opts.queryKey) ? String(opts.queryKey[0]) : "";
      if (key === "my-org-id") {
        return { data: "org-1", isLoading: false };
      }
      return { data: [], isLoading: false, isError: false };
    },
  };
});

vi.mock("@/hooks/useCommunities", () => ({
  communityQueryKeys: { all: ["communities"], list: (id: string) => ["communities", "list", id] },
  useCommunities: () => ({ data: rows, isPending: false, isError: false }),
  useUpdateCommunity: () => ({ mutate: vi.fn(), isPending: false }),
  useDeactivateCommunity: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useOrgVerificationAlerts", () => ({
  useOrgVerificationAlerts: () => ({ data: [] }),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Communities />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Communities list", () => {
  it("filters by name and sorts the name column", () => {
    renderPage();

    expect(screen.getByRole("link", { name: "NOWE POLESIE 3" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Alfa Park" })).toBeVisible();

    fireEvent.change(screen.getByLabelText("Szukaj wspólnoty po nazwie"), {
      target: { value: "alfa" },
    });
    expect(screen.getByRole("link", { name: "Alfa Park" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "NOWE POLESIE 3" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Szukaj wspólnoty po nazwie"), {
      target: { value: "" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Nazwa" }));
    const afterAsc = screen.getAllByRole("link").map((el) => el.textContent);
    expect(afterAsc[0]).toBe("Alfa Park");
    expect(afterAsc[1]).toBe("NOWE POLESIE 3");

    fireEvent.click(screen.getByRole("button", { name: "Nazwa" }));
    const afterDesc = screen.getAllByRole("link").map((el) => el.textContent);
    expect(afterDesc[0]).toBe("NOWE POLESIE 3");
    expect(afterDesc[1]).toBe("Alfa Park");
  });
});
