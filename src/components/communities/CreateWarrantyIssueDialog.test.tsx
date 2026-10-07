import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { CreateWarrantyIssueDialog } from "@/components/communities/CreateWarrantyIssueDialog";

vi.mock("@/hooks/useDeveloperWarranty", () => ({
  useCreateWarrantyIssue: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useCommunities", () => ({
  useCommunities: () => ({
    data: [{ id: "c1", name: "Wspólnota Test", org_id: "org-1" }],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useProperties", () => ({
  useLocationsByCommunity: () => ({
    data: [
      { id: "loc-1", address: "Pienista 51" },
      { id: "", address: "Pusty identyfikator" },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: "org-1", error: null }),
  },
}));

vi.mock("@/components/warranty/PhotoUpload", () => ({
  PhotoUpload: () => <div>Zdjęcia</div>,
}));

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateWarrantyIssueDialog open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("CreateWarrantyIssueDialog", () => {
  it("opens without a Select item that has an empty value", () => {
    renderDialog();

    expect(screen.getByRole("heading", { name: "Dodaj usterkę deweloperską" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Budynek" })).toHaveTextContent(
      "Nie dotyczy konkretnego budynku",
    );

    const optionValues = Array.from(document.querySelectorAll("option")).map((option) => option.value);
    expect(optionValues).not.toContain("");
    expect(optionValues).toContain("__none__");
    expect(optionValues).toContain("loc-1");
  });
});
