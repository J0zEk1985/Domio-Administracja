import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PropertyEcosystemEmergencyProvidersCard } from "@/components/property/PropertyEcosystemEmergencyProvidersCard";
import { EMERGENCY_TRADES } from "@/types/emergencyDuty";

vi.mock("@/hooks/useVendorPartners", () => ({
  useVendorPartners: () => ({ data: [{ id: "v1", name: "Firma Test" }] }),
}));

vi.mock("@/hooks/useCommunityEmergencyProviders", () => ({
  useCommunityEmergencyProviders: () => ({ data: [], isLoading: false }),
  useSaveEmergencyProvider: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));

describe("PropertyEcosystemEmergencyProvidersCard", () => {
  it("lists all 10 emergency trades for the community", () => {
    render(
      <PropertyEcosystemEmergencyProvidersCard orgId="org-1" communityId="com-1" canManage />,
    );

    expect(screen.getByText("Pogotowie 24h")).toBeVisible();
    for (const trade of EMERGENCY_TRADES) {
      expect(screen.getByText(trade.label)).toBeVisible();
    }
    expect(screen.getAllByRole("switch")).toHaveLength(EMERGENCY_TRADES.length);
  });
});
