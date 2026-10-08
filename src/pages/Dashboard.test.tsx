import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import Dashboard from "@/pages/Dashboard";

vi.mock("@/hooks/useDashboardMetrics", () => ({
  useDashboardMetrics: () => ({
    orgId: "org-1",
    orgLoading: false,
    overdueIssues: {
      isLoading: false,
      error: null,
      data: [
        {
          id: "issue-1",
          locationId: "loc-1",
          communityId: "com-1",
          dueAtIso: "2026-10-07T20:54:38.894Z",
          buildingName: "Pienista 51, 94-109 Łódź, Polska",
          communityName: "NOWE POLESIE 3",
          detail: "Hydrauliczna — Przeciek w węźle cieplnym przy pompie cyrkulacyjnej",
        },
      ],
    },
    missedCleaning: { isLoading: false, error: null, data: [] },
    expiringInspections: { isLoading: false, error: null, data: [] },
    expiringContracts: { isLoading: false, error: null, data: [] },
  }),
}));

vi.mock("@/hooks/useIsOrgOwner", () => ({
  useIsOrgOwner: () => ({ data: { isOwner: false } }),
}));

vi.mock("@/components/legal-entity/VerificationAlertsCard", () => ({
  VerificationAlertsCard: () => null,
}));

describe("Dashboard overdue issues", () => {
  it("shows the building address and the community", () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    const building = screen.getByRole("link", { name: "Pienista 51, 94-109 Łódź, Polska" });
    expect(building).toHaveAttribute("href", "/properties/loc-1");

    const community = screen.getByRole("link", { name: "Wspólnota: NOWE POLESIE 3" });
    expect(community).toHaveAttribute("href", "/communities/com-1");

    expect(
      screen.getByRole("link", { name: "Hydrauliczna — Przeciek w węźle cieplnym przy pompie cyrkulacyjnej" }),
    ).toHaveAttribute("href", "/issues?id=issue-1");
  });
});
