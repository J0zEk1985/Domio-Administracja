/**
 * Reads and writes agent_community_rules on domio-agent-db as supabase_admin.
 * The browser never opens that database. Secrets: AGENT_DB_URL,
 * DOMIO_AGENT_USER_TOKEN_SECRET, AGENT_WEBHOOK_URL, AGENT_WEBHOOK_TOKEN.
 * SUPABASE_URL and SUPABASE_ANON_KEY are provided by the edge runtime.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { agentSecret } from "../_shared/agentRuntimeConfig.ts";
import { signDomioAgentUserToken } from "../_shared/agentUserToken.ts";
import {
  deleteCommunityRule,
  insertCommunityRule,
  listCommunityRules,
  syncAdminNotes,
  updateCommunityRule,
} from "../_shared/agentRulesStore.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_ID = /^[A-Za-z0-9_.:@-]{1,200}$/;
const EDITABLE_CATEGORIES = new Set(["finance", "maintenance", "communication", "general"]);
const DOMIO_SOURCE = /^domio-[a-z0-9-]{1,40}$/;

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireUuid(value: unknown, label: string): string {
  const id = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!UUID.test(id)) throw new HttpError(400, `Nieprawidłowy identyfikator: ${label}.`);
  return id;
}

function cleanContent(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "Treść wytycznej jest wymagana.");
  const text = value.replace(/\u0000/g, "").trim();
  if (text.length < 1 || text.length > 2000) {
    throw new HttpError(400, "Treść wytycznej musi mieć od 1 do 2000 znaków.");
  }
  return text;
}

function cleanCategory(value: unknown): string {
  const category = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!EDITABLE_CATEGORIES.has(category)) {
    throw new HttpError(400, "Wybierz kategorię: Finanse, Konserwacja/Serwis, Komunikacja albo Ogólne.");
  }
  return category;
}

function mapStoreError(error: unknown): HttpError {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[agent-community-rules]", message);
  if (message.includes("Za dużo wspólnot")) return new HttpError(400, message);
  if (message.includes("AGENT_DB_URL") || message.includes("DOMIO_AGENT_USER_TOKEN_SECRET") || message.includes("AGENT_WEBHOOK")) {
    return new HttpError(503, "Połączenie z bazą procedur agenta nie jest skonfigurowane.");
  }
  if (message.includes("agent_community_rules_content_chk")) {
    return new HttpError(400, "Treść wytycznej musi mieć od 1 do 2000 znaków.");
  }
  return new HttpError(503, "Nie udało się wykonać operacji na procedurach agenta.");
}

type UserClient = ReturnType<typeof createClient>;

async function requireUser(req: Request): Promise<{ userId: string; client: UserClient }> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const authorization = req.headers.get("Authorization") ?? "";
  if (!url || !anon || !authorization.startsWith("Bearer ")) {
    throw new HttpError(401, "Brak sesji.");
  }
  const client = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Brak sesji.");
  return { userId: data.user.id, client };
}

async function loadCommunity(client: UserClient, communityId: string): Promise<{ org_id: string; status: string }> {
  const { data, error } = await client
    .from("communities")
    .select("org_id, status")
    .eq("id", communityId)
    .maybeSingle();
  if (error || !data?.org_id) throw new HttpError(403, "Brak uprawnień do procedur tej wspólnoty.");
  return { org_id: String(data.org_id), status: String(data.status ?? "") };
}

function assertActive(status: string): void {
  const normalized = status.toLowerCase();
  if (normalized === "inactive" || normalized === "archived") {
    throw new HttpError(409, "Wspólnota nieaktywna — wytyczne AI są tylko do odczytu.");
  }
}

async function assertManager(client: UserClient, communityId: string, write: boolean): Promise<void> {
  const { data: allowed, error } = await client.rpc("can_manage_community_agent_rules", {
    p_community_id: communityId,
  });
  if (error || allowed !== true) {
    throw new HttpError(403, "Brak uprawnień do procedur tej wspólnoty.");
  }
  if (!write) return;
  const community = await loadCommunity(client, communityId);
  assertActive(community.status);
}

async function assertNotesEditor(client: UserClient, communityId: string): Promise<void> {
  const community = await loadCommunity(client, communityId);
  assertActive(community.status);
  const { data: allowed, error } = await client.rpc("is_org_admin_team", {
    target_org_id: community.org_id,
  });
  if (error || allowed !== true) {
    throw new HttpError(403, "Brak uprawnień do uwag tej wspólnoty.");
  }
}

async function allowedCommunityIds(client: UserClient): Promise<string[]> {
  const { data, error } = await client.rpc("list_my_agent_community_ids");
  if (error) {
    console.error("[agent-community-rules] list_my_agent_community_ids", error.message);
    throw new HttpError(403, "Brak uprawnień do wspólnot.");
  }
  const rows = Array.isArray(data) ? data : [];
  return rows
    .map((row) => {
      if (typeof row === "string") return row.trim().toLowerCase();
      if (row && typeof row === "object" && "community_id" in row) {
        return String(row.community_id).trim().toLowerCase();
      }
      return "";
    })
    .filter((id) => UUID.test(id));
}

async function orgMapForCommunities(
  client: UserClient,
  communityIds: readonly string[],
): Promise<Record<string, string[]>> {
  if (!communityIds.length) return {};
  const { data, error } = await client.from("communities").select("id, org_id").in("id", communityIds);
  if (error || !Array.isArray(data)) return {};
  const grouped = new Map<string, string[]>();
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const id = "id" in row ? String(row.id).trim().toLowerCase() : "";
    const org = "org_id" in row ? String(row.org_id).trim().toLowerCase() : "";
    if (!UUID.test(id) || !UUID.test(org) || !communityIds.includes(id)) continue;
    const list = grouped.get(org) ?? [];
    list.push(id);
    grouped.set(org, list);
  }
  const map: Record<string, string[]> = {};
  for (const org of [...grouped.keys()].sort()) {
    map[org] = [...new Set(grouped.get(org))].sort();
  }
  return map;
}

async function issueToken(userId: string, communityIds: readonly string[], client: UserClient) {
  const secret = agentSecret("DOMIO_AGENT_USER_TOKEN_SECRET");
  if (secret.length < 16) throw new Error("DOMIO_AGENT_USER_TOKEN_SECRET is not configured");
  const orgCommunities = await orgMapForCommunities(client, communityIds);
  const allowedOrgIds = Object.keys(orgCommunities);
  return signDomioAgentUserToken(userId, communityIds, secret, Date.now(), {
    userId: userId.toLowerCase(),
    orgId: allowedOrgIds.length === 1 ? allowedOrgIds[0] : null,
    allowedOrgIds,
    orgCommunities,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ message: "Dozwolone jest tylko POST." }, 405);

  try {
    const { userId, client } = await requireUser(req);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new HttpError(400, "Nieprawidłowe żądanie.");
    }
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "issue_token") {
      const ids = await allowedCommunityIds(client);
      const signed = await issueToken(userId, ids, client);
      return jsonResponse({
        operator_id: userId.toLowerCase(),
        allowed_community_ids: signed.allowedCommunityIds,
        org_id: signed.orgId,
        allowed_org_ids: signed.allowedOrgIds,
        expires_at: signed.expiresAt,
        token: signed.token,
      }, 200);
    }

    if (action === "invoke") {
      return jsonResponse(await invokeAgent(userId, client, body), 200);
    }

    const communityId = requireUuid(body.community_id, "wspólnota");
    if (action === "sync_admin_notes") {
      await assertNotesEditor(client, communityId);
    } else {
      await assertManager(client, communityId, action !== "list");
    }

    if (action === "list") {
      const rules = await listCommunityRules(communityId);
      return jsonResponse({ rules }, 200);
    }
    if (action === "create") {
      const rule = await insertCommunityRule(communityId, cleanCategory(body.category), cleanContent(body.rule_content));
      return jsonResponse({ rule }, 201);
    }
    if (action === "update") {
      const rule = await updateCommunityRule(
        communityId,
        requireUuid(body.id, "wytyczna"),
        cleanCategory(body.category),
        cleanContent(body.rule_content),
      );
      if (!rule) throw new HttpError(404, "Nie znaleziono wytycznej tej wspólnoty.");
      return jsonResponse({ rule }, 200);
    }
    if (action === "delete") {
      const removed = await deleteCommunityRule(communityId, requireUuid(body.id, "wytyczna"));
      if (!removed) throw new HttpError(404, "Nie znaleziono wytycznej tej wspólnoty.");
      return jsonResponse({ ok: true }, 200);
    }
    if (action === "sync_admin_notes") {
      const content = typeof body.content === "string" ? body.content.replace(/\u0000/g, "").trim() : "";
      if (content.length > 2000) {
        throw new HttpError(400, "Uwagi dla administracji mogą mieć najwyżej 2000 znaków, żeby agent mógł je przyjąć.");
      }
      await syncAdminNotes(communityId, content);
      return jsonResponse({ ok: true }, 200);
    }
    throw new HttpError(400, "Nieznana operacja.");
  } catch (error) {
    if (error instanceof HttpError) return jsonResponse({ message: error.message }, error.status);
    const mapped = mapStoreError(error);
    return jsonResponse({ message: mapped.message }, mapped.status);
  }
});

async function invokeAgent(userId: string, client: UserClient, body: Record<string, unknown>) {
  const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!SESSION_ID.test(sessionId)) throw new HttpError(400, "Identyfikator sesji jest nieprawidłowy.");
  if (content.length < 1 || content.length > 20000) {
    throw new HttpError(400, "Wiadomość jest wymagana i może mieć najwyżej 20000 znaków.");
  }
  const ids = await allowedCommunityIds(client);
  const requested = typeof body.community_id === "string" && body.community_id.trim()
    ? requireUuid(body.community_id, "wspólnota")
    : null;
  if (requested && !ids.includes(requested)) {
    throw new HttpError(403, "Brak uprawnień do tej wspólnoty.");
  }
  const requestedSource = typeof body.source === "string" ? body.source.trim().toLowerCase() : "";
  const source = DOMIO_SOURCE.test(requestedSource) ? requestedSource : "domio-administracja";
  const signed = await issueToken(userId, ids, client);
  const webhookUrl = agentSecret("AGENT_WEBHOOK_URL");
  const webhookToken = agentSecret("AGENT_WEBHOOK_TOKEN");
  if (!webhookUrl || !webhookToken) throw new Error("AGENT_WEBHOOK_URL is not configured");

  let upstream: Response;
  try {
    upstream = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-DOMIO-Agent-Token": webhookToken,
        "X-DOMIO-User-Token": signed.token,
      },
      body: JSON.stringify({
        session_id: sessionId,
        role: "user",
        operator_id: userId.toLowerCase(),
        community_id: requested,
        content,
        metadata: { source },
      }),
      signal: AbortSignal.timeout(180000),
    });
  } catch (error) {
    console.error("[agent-community-rules] webhook", error instanceof Error ? error.message : "unknown");
    throw new HttpError(502, "Agent jest teraz niedostępny. Spróbuj ponownie za chwilę.");
  }

  const text = await upstream.text();
  let payload: unknown = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  if (!upstream.ok || !payload || (typeof payload === "object" && payload !== null && "ok" in payload && payload.ok === false)) {
    const message = payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
      ? payload.message
      : payload && typeof payload === "object" && "errors" in payload && Array.isArray(payload.errors)
        ? payload.errors.map((item) => String(item)).join(" ")
        : "Agent nie przyjął wiadomości.";
    const status = upstream.status === 403 ? 403 : upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
    throw new HttpError(status, message);
  }
  return payload;
}
