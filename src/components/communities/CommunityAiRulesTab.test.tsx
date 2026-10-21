import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CommunityAiRulesTab } from "@/components/communities/CommunityAiRulesTab";

vi.mock("@/hooks/useAgentCommunityRules", () => ({
  useAgentCommunityRules: () => ({
    canManage: true,
    accessLoading: false,
    accessError: null,
    rules: [
      {
        id: "rule-global",
        community_id: null,
        operator_id: null,
        category: "general",
        rule_content: "Brak numeru wspólnoty oznacza dopytanie.",
        created_at: "2026-10-18T10:00:00.000Z",
        updated_at: "2026-10-18T10:00:00.000Z",
      },
      {
        id: "rule-finance",
        community_id: "community-1",
        operator_id: null,
        category: "finance",
        rule_content: "Każdy wydatek powyżej 500 zł wymaga akceptacji zarządu.",
        created_at: "2026-10-18T10:00:00.000Z",
        updated_at: "2026-10-18T10:00:00.000Z",
      },
      {
        id: "rule-operator",
        community_id: null,
        operator_id: "user-1",
        category: "communication",
        rule_content: "Zaczynaj pisma od Dzień dobry.",
        created_at: "2026-10-21T10:00:00.000Z",
        updated_at: "2026-10-21T10:00:00.000Z",
      },
    ],
    rulesLoading: false,
    rulesError: null,
    createRule: vi.fn(),
    updateRule: vi.fn(),
    deleteRule: vi.fn(),
    isSaving: false,
  }),
}));

describe("CommunityAiRulesTab", () => {
  it("lists shared community rules and hides the operator style tools", () => {
    render(<CommunityAiRulesTab communityId="community-1" />);

    expect(screen.getByText("Reguła globalna")).toBeInTheDocument();
    expect(screen.getByText("Finanse")).toBeInTheDocument();
    expect(screen.getAllByText("Ogólne").length).toBeGreaterThan(0);
    expect(screen.getByText("Każdy wydatek powyżej 500 zł wymaga akceptacji zarządu.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edytuj" })).toBeInTheDocument();
    expect(screen.getAllByText("Wspólnota").length).toBeGreaterThan(0);
    expect(screen.queryByText("Zaczynaj pisma od Dzień dobry.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Przeanalizuj mój styl" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zatwierdź" })).not.toBeInTheDocument();
  });
});
