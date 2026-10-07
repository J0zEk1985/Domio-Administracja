import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { CommunityWarrantyTab } from "@/components/communities/CommunityWarrantyTab";
import type { DeveloperWarrantyIssue } from "@/types/developer-warranty";

vi.mock("@/components/communities/DeveloperAccessCard", () => ({
  DeveloperAccessCard: () => <div>Dostęp dewelopera</div>,
}));

vi.mock("@/components/communities/CreateWarrantyIssueDialog", () => ({
  CreateWarrantyIssueDialog: ({
    open,
    issue,
  }: {
    open: boolean;
    issue?: { title: string } | null;
  }) => (open && issue ? <div>Edycja: {issue.title}</div> : open ? <div>Nowa usterka</div> : null),
}));

const draftIssue = {
  id: "issue-1",
  community_id: "community-1",
  org_id: "org-1",
  location_master_id: null,
  title: "Przeciek przy miejscu postojowym 56",
  description: "W hali garażowej",
  category: "Inne",
  location_detail: "Miejsce 56",
  priority: "high",
  photos_reported: [],
  photos_completion: [],
  status: "draft",
  reported_at: null,
  acknowledged_at: null,
  completed_at: null,
  rejected_at: null,
  appealed_at: null,
  rejection_reason: null,
  appeal_notes: null,
  source_type: "manual",
  source_metadata: {},
  created_at: "2026-10-07T08:00:00.000Z",
  created_by: null,
  updated_at: "2026-10-07T08:00:00.000Z",
  updated_by: null,
} as DeveloperWarrantyIssue;

const publishedIssue = {
  ...draftIssue,
  id: "issue-2",
  title: "Pęknięta szyba",
  status: "reported",
} as DeveloperWarrantyIssue;

vi.mock("@/hooks/useDeveloperWarranty", () => ({
  useDeveloperAccess: () => ({ data: null, isLoading: false }),
  useWarrantyIssues: () => ({ data: [draftIssue, publishedIssue], isLoading: false }),
  useCommunityWarrantySettings: () => ({
    data: { resident_visibility_enabled: true },
    isLoading: false,
  }),
  useUpdateCommunityWarrantySettings: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteWarrantyIssue: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateWarrantyIssueStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("CommunityWarrantyTab", () => {
  it("lets a manager edit a draft before publishing", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CommunityWarrantyTab
            communityId="community-1"
            communityName="Pienista"
            orgId="org-1"
            canManage
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getAllByRole("button", { name: "Opublikuj" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Edytuj" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Edytuj" }));

    expect(screen.getByText("Edycja: Przeciek przy miejscu postojowym 56")).toBeInTheDocument();
  });
});
