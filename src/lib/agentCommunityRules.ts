import { FunctionsHttpError } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

export const AI_RULE_CATEGORIES = [
  { value: "finance", label: "Finanse" },
  { value: "maintenance", label: "Konserwacja/Serwis" },
  { value: "communication", label: "Komunikacja" },
  { value: "general", label: "Ogólne" },
] as const;

export type AiRuleCategory = (typeof AI_RULE_CATEGORIES)[number]["value"];

const CATEGORY_LABELS: Record<string, string> = {
  finance: "Finanse",
  maintenance: "Konserwacja/Serwis",
  communication: "Komunikacja",
  general: "Ogólne",
  admin_notes: "Uwagi administracji",
};

export type AgentCommunityRule = {
  id: string;
  community_id: string | null;
  operator_id: string | null;
  category: string;
  rule_content: string;
  created_at: string;
  updated_at: string;
};

export function agentRuleCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function isGlobalAgentRule(rule: Pick<AgentCommunityRule, "community_id">): boolean {
  return rule.community_id == null || rule.community_id === "";
}

export function isEditableAgentRule(
  rule: Pick<AgentCommunityRule, "community_id" | "category">,
  communityId: string,
): boolean {
  return rule.community_id === communityId && rule.category !== "admin_notes";
}

async function invokeRules<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("agent-community-rules", { body });
  if (error) {
    let message = "Nie udało się wykonać operacji na wytycznych AI.";
    if (error instanceof FunctionsHttpError) {
      try {
        const payload = await error.context.json();
        if (payload && typeof payload.message === "string" && payload.message.trim()) {
          message = payload.message;
        }
      } catch (parseError) {
        console.error("[agentCommunityRules] error body", parseError);
      }
    } else if (error instanceof Error && error.message) {
      message = error.message;
    }
    console.error("[agentCommunityRules]", error);
    throw new Error(message);
  }
  if (data == null) throw new Error("Serwer nie zwrócił danych wytycznych AI.");
  return data;
}

export async function fetchCanManageAgentRules(communityId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("can_manage_community_agent_rules", {
    p_community_id: communityId,
  });
  if (error) {
    console.error("[fetchCanManageAgentRules]", error);
    throw error;
  }
  return data === true;
}

export async function listAgentCommunityRules(communityId: string): Promise<AgentCommunityRule[]> {
  const data = await invokeRules<{ rules: AgentCommunityRule[] }>({
    action: "list",
    community_id: communityId,
  });
  return Array.isArray(data.rules) ? data.rules : [];
}

export async function createAgentCommunityRule(input: {
  communityId: string;
  category: AiRuleCategory;
  ruleContent: string;
}): Promise<AgentCommunityRule> {
  const data = await invokeRules<{ rule: AgentCommunityRule }>({
    action: "create",
    community_id: input.communityId,
    category: input.category,
    rule_content: input.ruleContent,
  });
  return data.rule;
}

export async function updateAgentCommunityRule(input: {
  communityId: string;
  id: string;
  category: AiRuleCategory;
  ruleContent: string;
}): Promise<AgentCommunityRule> {
  const data = await invokeRules<{ rule: AgentCommunityRule }>({
    action: "update",
    community_id: input.communityId,
    id: input.id,
    category: input.category,
    rule_content: input.ruleContent,
  });
  return data.rule;
}

export async function deleteAgentCommunityRule(communityId: string, id: string): Promise<void> {
  await invokeRules<{ ok: boolean }>({ action: "delete", community_id: communityId, id });
}

export async function syncCommunityAdminNotes(communityId: string, content: string): Promise<void> {
  await invokeRules<{ ok: boolean }>({
    action: "sync_admin_notes",
    community_id: communityId,
    content,
  });
}

export async function invokeDomioAgent(input: {
  sessionId: string;
  content: string;
  communityId?: string | null;
  source?: string;
}): Promise<unknown> {
  return invokeRules({
    action: "invoke",
    session_id: input.sessionId,
    content: input.content,
    community_id: input.communityId ?? null,
    source: input.source ?? "domio-administracja",
  });
}
