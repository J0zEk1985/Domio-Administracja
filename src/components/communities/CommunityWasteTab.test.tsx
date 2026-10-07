import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CommunityWasteTab } from "@/components/communities/CommunityWasteTab";
import type { CommunityLocationRow } from "@/hooks/useProperties";

const { fetchWasteSyncLogs, useWasteSchedule } = vi.hoisted(() => ({
  fetchWasteSyncLogs: vi.fn(),
  useWasteSchedule: vi.fn(),
}));

vi.mock("@/lib/wasteManagementApi", () => ({
  fetchWasteSyncLogs,
}));

vi.mock("@/hooks/useWasteManagement", () => ({
  useWasteSchedule,
  useCreateWasteSchedule: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateWasteSchedules: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateWasteSchedule: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteWasteSchedule: () => ({ mutate: vi.fn(), isPending: false }),
  useSyncWasteScheduleFromCity: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/components/ui/sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const building: CommunityLocationRow = {
  id: "loc-1",
  name: "Piotrkowska 1",
  address: "Piotrkowska 1, Łódź",
  locationMasterId: null,
};

function renderTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <CommunityWasteTab communityId="community-1" orgId="org-1" buildings={[building]} />
    </QueryClientProvider>,
  );
}

describe("CommunityWasteTab", () => {
  it("shows the schedule and sync history when a log has a sync time", async () => {
    useWasteSchedule.mockReturnValue({
      data: [
        {
          id: "schedule-1",
          wasteType: "mixed",
          collectionDate: "2026-10-20",
          collectionTimeFrom: null,
          collectionTimeUntil: null,
          dataSource: "manual",
          cityAdapter: null,
          notes: null,
        },
      ],
      isLoading: false,
      error: null,
    });
    fetchWasteSyncLogs.mockResolvedValue([
      {
        id: "log-1",
        locationId: "loc-1",
        cityAdapter: "lodz",
        syncStatus: "success",
        recordsAdded: 4,
        recordsUpdated: 0,
        errorMessage: null,
        syncedAt: "2026-10-07T06:15:00.000Z",
        syncedBy: null,
      },
    ]);

    renderTab();

    expect(screen.getByText("20 października 2026")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Historia synchronizacji")).toBeInTheDocument();
    });
    expect(screen.getByText("lodz")).toBeInTheDocument();
    expect(screen.getByText("Sukces")).toBeInTheDocument();
  });

  it("keeps the schedule visible when a sync log has no timestamp", async () => {
    useWasteSchedule.mockReturnValue({
      data: [
        {
          id: "schedule-1",
          wasteType: "bulk",
          collectionDate: "2026-11-02",
          collectionTimeFrom: null,
          collectionTimeUntil: null,
          dataSource: "city_scraper",
          cityAdapter: "lodz",
          notes: null,
        },
      ],
      isLoading: false,
      error: null,
    });
    fetchWasteSyncLogs.mockResolvedValue([
      {
        id: "log-1",
        locationId: "loc-1",
        cityAdapter: "lodz",
        syncStatus: "error",
        recordsAdded: 0,
        recordsUpdated: 0,
        errorMessage: "timeout",
        syncedAt: undefined,
        syncedBy: null,
      },
    ]);

    renderTab();

    expect(screen.getByText("2 listopada 2026")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Historia synchronizacji")).toBeInTheDocument();
    });
    expect(screen.getByText("timeout")).toBeInTheDocument();
  });
});
