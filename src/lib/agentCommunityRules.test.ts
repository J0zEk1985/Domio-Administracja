import { describe, expect, it } from "vitest";

import {
  agentRuleCategoryLabel,
  isEditableAgentRule,
  isGlobalAgentRule,
  isOperatorAgentRule,
} from "@/lib/agentCommunityRules";

describe("agent community rule labels", () => {
  it("names the categories shown in the community panel", () => {
    expect(agentRuleCategoryLabel("finance")).toBe("Finanse");
    expect(agentRuleCategoryLabel("maintenance")).toBe("Konserwacja/Serwis");
    expect(agentRuleCategoryLabel("communication")).toBe("Komunikacja");
    expect(agentRuleCategoryLabel("general")).toBe("Ogólne");
    expect(agentRuleCategoryLabel("admin_notes")).toBe("Uwagi administracji");
  });

  it("keeps company-wide rules and synced administration notes out of the editor", () => {
    expect(isGlobalAgentRule({ community_id: null, operator_id: null })).toBe(true);
    expect(isGlobalAgentRule({ community_id: null, operator_id: "user-1" })).toBe(false);
    expect(isOperatorAgentRule({ operator_id: "user-1" })).toBe(true);
    expect(
      isEditableAgentRule(
        { community_id: "community-1", operator_id: null, category: "finance" },
        "community-1",
      ),
    ).toBe(true);
    expect(
      isEditableAgentRule(
        { community_id: null, operator_id: "user-1", category: "communication" },
        "community-1",
      ),
    ).toBe(false);
    expect(
      isEditableAgentRule(
        { community_id: null, operator_id: null, category: "general" },
        "community-1",
      ),
    ).toBe(false);
    expect(
      isEditableAgentRule(
        { community_id: "community-1", operator_id: null, category: "admin_notes" },
        "community-1",
      ),
    ).toBe(false);
    expect(
      isEditableAgentRule(
        { community_id: "community-2", operator_id: null, category: "finance" },
        "community-1",
      ),
    ).toBe(false);
  });
});
