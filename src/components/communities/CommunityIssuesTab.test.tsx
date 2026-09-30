import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CommunityIssuesTab } from "@/components/communities/CommunityIssuesTab";

vi.mock("@/hooks/useTriageIssues", () => ({
  useTriageIssues: () => ({ data: [], isLoading: false, isError: false }),
}));

describe("CommunityIssuesTab", () => {
  it("asks to assign a building when the community has none", () => {
    render(<CommunityIssuesTab buildingIds={[]} />);
    expect(
      screen.getByText(
        "Dodaj co najmniej jeden budynek do wspólnoty, aby zobaczyć zgłoszenia serwisowe.",
      ),
    ).toBeVisible();
  });
});
