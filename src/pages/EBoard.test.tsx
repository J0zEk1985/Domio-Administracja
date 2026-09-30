import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import EBoard from "@/pages/EBoard";

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

vi.mock("@/hooks/useEBoardMessages", () => ({
  useEBoardMessages: () => ({ data: [], isPending: false, isError: false }),
  useCreateEBoardMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateEBoardMessage: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useCommunities", () => ({
  useCommunities: () => ({ data: [] }),
}));

describe("EBoard", () => {
  it("shows search and sort controls on the announcement list", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <EBoard />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Tablica ogłoszeń (E-Board)" })).toBeVisible();
    expect(screen.getByLabelText("Szukaj ogłoszeń")).toBeVisible();
    expect(screen.getByLabelText("Sortuj ogłoszenia")).toBeVisible();
  });
});
