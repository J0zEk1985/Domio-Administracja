import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { CreateWarrantyIssueDialog } from "@/components/communities/CreateWarrantyIssueDialog";
import type { WarrantyIssueDraft } from "@/components/communities/CreateWarrantyIssueDialog";

const { updateWarrantyIssue } = vi.hoisted(() => ({
  updateWarrantyIssue: vi.fn().mockResolvedValue({ id: "issue-1" }),
}));

vi.mock("@/hooks/useDeveloperWarranty", () => ({
  useCreateWarrantyIssue: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateWarrantyIssue: () => ({ mutateAsync: updateWarrantyIssue, isPending: false }),
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
      { id: "loc-1", address: "Pienista 51", locationMasterId: "master-1" },
      { id: "", address: "Pusty identyfikator", locationMasterId: null },
      { id: "loc-2", address: "Bez adresu głównego", locationMasterId: null },
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

vi.mock("@/hooks/useWarrantyPhotoUpload", () => ({
  useWarrantyPhotoUpload: () => ({
    deletePhoto: vi.fn().mockResolvedValue(true),
    uploadPhotos: vi.fn(),
    uploading: false,
    progress: [],
  }),
}));

const draftIssue: WarrantyIssueDraft = {
  id: "issue-1",
  community_id: "c1",
  status: "draft",
  title: "Przeciek przy miejscu postojowym 56",
  description: "W hali garażowej przecieka woda",
  category: "Inne",
  location_master_id: "master-1",
  location_detail: "Miejsce 56",
  priority: "high",
  photos_reported: [],
};

function renderDialog(issue?: WarrantyIssueDraft) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateWarrantyIssueDialog open onOpenChange={vi.fn()} communityId="c1" orgId="org-1" issue={issue} />
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
    expect(optionValues).toContain("master-1");
    expect(optionValues).not.toContain("loc-1");
    expect(optionValues).not.toContain("loc-2");
  });

  it("opens a draft with its current values and saves the edit", async () => {
    updateWarrantyIssue.mockClear();
    renderDialog(draftIssue);

    expect(screen.getByRole("heading", { name: "Edytuj usterkę deweloperską" })).toBeInTheDocument();
    const title = screen.getByLabelText(/Tytuł usterki/i);
    expect(title).toHaveValue("Przeciek przy miejscu postojowym 56");
    expect(screen.getByLabelText(/^Opis/i)).toHaveValue("W hali garażowej przecieka woda");
    expect(screen.getByRole("combobox", { name: "Priorytet" })).toHaveTextContent("Wysoki");

    fireEvent.change(title, { target: { value: "Przeciek przy miejscu 57" } });
    fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(updateWarrantyIssue).toHaveBeenCalledWith({
      id: "issue-1",
      dto: {
        title: "Przeciek przy miejscu 57",
        description: "W hali garażowej przecieka woda",
        category: "Inne",
        location_master_id: "master-1",
        location_detail: "Miejsce 56",
        priority: "high",
        photos_reported: [],
      },
    }));
  });
});
