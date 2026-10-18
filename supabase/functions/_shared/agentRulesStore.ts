import postgres from "npm:postgres@3.4.7";
import { agentSecret } from "./agentRuntimeConfig.ts";

export type AgentRuleRow = {
  id: string;
  community_id: string | null;
  operator_id: string | null;
  category: string;
  rule_content: string;
  created_at: string;
  updated_at: string;
};

type Sql = ReturnType<typeof postgres>;

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : "";
}

function mapRule(row: Record<string, unknown>): AgentRuleRow {
  return {
    id: String(row.id),
    community_id: row.community_id == null ? null : String(row.community_id),
    operator_id: row.operator_id == null ? null : String(row.operator_id),
    category: String(row.category),
    rule_content: String(row.rule_content),
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at),
  };
}

async function withAgentDb<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const url = agentSecret("AGENT_DB_URL");
  if (!url) throw new Error("AGENT_DB_URL is not configured");
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function listCommunityRules(communityId: string): Promise<AgentRuleRow[]> {
  return withAgentDb(async (sql) => {
    const rows = await sql<Record<string, unknown>[]>`
      SELECT id, community_id, operator_id, category, rule_content, created_at, updated_at
      FROM public.agent_community_rules
      WHERE community_id IS NULL OR community_id = ${communityId}
      ORDER BY community_id NULLS FIRST, category ASC, updated_at DESC
      LIMIT 200
    `;
    return rows.map(mapRule);
  });
}

export function insertCommunityRule(
  communityId: string,
  category: string,
  ruleContent: string,
): Promise<AgentRuleRow | null> {
  return withAgentDb(async (sql) => {
    const rows = await sql<Record<string, unknown>[]>`
      INSERT INTO public.agent_community_rules (community_id, operator_id, category, rule_content)
      VALUES (${communityId}, NULL, ${category}, ${ruleContent})
      RETURNING id, community_id, operator_id, category, rule_content, created_at, updated_at
    `;
    return rows[0] ? mapRule(rows[0]) : null;
  });
}

export function updateCommunityRule(
  communityId: string,
  ruleId: string,
  category: string,
  ruleContent: string,
): Promise<AgentRuleRow | null> {
  return withAgentDb(async (sql) => {
    const rows = await sql<Record<string, unknown>[]>`
      UPDATE public.agent_community_rules
      SET category = ${category}, rule_content = ${ruleContent}
      WHERE id = ${ruleId}::uuid
        AND community_id = ${communityId}
        AND category <> 'admin_notes'
      RETURNING id, community_id, operator_id, category, rule_content, created_at, updated_at
    `;
    return rows[0] ? mapRule(rows[0]) : null;
  });
}

export function deleteCommunityRule(communityId: string, ruleId: string): Promise<boolean> {
  return withAgentDb(async (sql) => {
    const rows = await sql<{ id: string }[]>`
      DELETE FROM public.agent_community_rules
      WHERE id = ${ruleId}::uuid
        AND community_id = ${communityId}
        AND category <> 'admin_notes'
      RETURNING id
    `;
    return rows.length > 0;
  });
}

export function syncAdminNotes(communityId: string, ruleContent: string): Promise<void> {
  return withAgentDb(async (sql) => {
    if (!ruleContent) {
      await sql`
        DELETE FROM public.agent_community_rules
        WHERE community_id = ${communityId}
          AND category = 'admin_notes'
          AND operator_id IS NULL
      `;
      return;
    }
    await sql`
      INSERT INTO public.agent_community_rules (community_id, operator_id, category, rule_content)
      VALUES (${communityId}, NULL, 'admin_notes', ${ruleContent})
      ON CONFLICT (community_id)
        WHERE category = 'admin_notes' AND operator_id IS NULL AND community_id IS NOT NULL
      DO UPDATE SET rule_content = EXCLUDED.rule_content
    `;
  });
}
