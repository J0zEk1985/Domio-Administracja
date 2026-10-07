import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PropertyResidentIssueVisibilityCard } from "@/components/property/PropertyResidentIssueVisibilityCard";

const save = vi.fn();

vi.mock("@/hooks/useResidentBuildingIssueScope", () => ({
  useResidentBuildingIssueScope: () => ({
    scope: "resident_reports" as const,
    isLoading: false,
    isError: false,
    isSaving: false,
    save,
  }),
}));

describe("PropertyResidentIssueVisibilityCard", () => {
  it("saves all open issues when an administrator selects that scope", () => {
    save.mockClear();

    render(
      <PropertyResidentIssueVisibilityCard locationId="loc-1" orgId="org-1" canManage />,
    );

    expect(screen.getByText("Tylko zgłoszenia mieszkańców")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Wszystkie otwarte usterki"));

    expect(save).toHaveBeenCalledWith("all_open");
  });
});
