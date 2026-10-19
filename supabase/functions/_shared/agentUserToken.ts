/**
 * Signs the DOMIO user token checked by agent-n8n/scripts/agent-user-token.mjs.
 * Payload keys, in this order: operator_id, allowed_community_ids, exp.
 * Optional keys after those: user_id, org_id, allowed_org_ids.
 * Token: v1.<base64url(json)>.<base64url(hmac-sha256(secret, "v1." + payload))>
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const B64_URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const SCOPE_ID = /^[A-Za-z0-9_.:@-]{1,80}$/;
const TOKEN_TTL_SECONDS = 15 * 60;
const MAX_COMMUNITIES = 200;

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const b0 = bytes[index];
    const b1 = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const b2 = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    out += B64_URL[(triple >> 18) & 63];
    out += B64_URL[(triple >> 12) & 63];
    if (index + 1 < bytes.length) out += B64_URL[(triple >> 6) & 63];
    if (index + 2 < bytes.length) out += B64_URL[triple & 63];
  }
  return out;
}

export function normalizeCommunityIds(values: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const id = value.trim().toLowerCase();
    if (!SCOPE_ID.test(id)) continue;
    unique.add(id);
  }
  const ids = [...unique].sort();
  if (ids.length > MAX_COMMUNITIES) {
    throw new Error("Za dużo wspólnot w zakresie uprawnień.");
  }
  return ids;
}

export async function signDomioAgentUserToken(
  operatorId: string,
  communityIds: readonly string[],
  secret: string,
  nowMs = Date.now(),
  scope?: {
    userId?: string | null;
    orgId?: string | null;
    allowedOrgIds?: readonly string[];
    orgCommunities?: Record<string, readonly string[]> | null;
  },
): Promise<{
  token: string;
  expiresAt: string;
  allowedCommunityIds: string[];
  userId: string | null;
  orgId: string | null;
  allowedOrgIds: string[];
}> {
  const operator = operatorId.trim().toLowerCase();
  if (!SCOPE_ID.test(operator) || secret.trim().length < 16) {
    throw new Error("Nie można podpisać tożsamości agenta.");
  }
  const allowedCommunityIds = normalizeCommunityIds(communityIds);
  const exp = Math.floor(nowMs / 1000) + TOKEN_TTL_SECONDS;
  const userId = scope?.userId && UUID.test(scope.userId) ? scope.userId.trim().toLowerCase() : null;
  const allowedOrgIds = [...new Set((scope?.allowedOrgIds ?? [])
    .map((id) => id.trim().toLowerCase())
    .filter((id) => UUID.test(id)))].sort();
  const orgId = scope?.orgId && UUID.test(scope.orgId)
    ? scope.orgId.trim().toLowerCase()
    : (allowedOrgIds.length === 1 ? allowedOrgIds[0] : null);
  if (orgId && allowedOrgIds.length && !allowedOrgIds.includes(orgId)) {
    throw new Error("Nie można podpisać tożsamości agenta.");
  }
  const payloadObject: Record<string, unknown> = {
    operator_id: operator,
    allowed_community_ids: allowedCommunityIds,
    exp,
  };
  if (userId) payloadObject.user_id = userId;
  if (orgId) payloadObject.org_id = orgId;
  if (allowedOrgIds.length) payloadObject.allowed_org_ids = allowedOrgIds;
  if (scope?.orgCommunities && Object.keys(scope.orgCommunities).length) {
    payloadObject.org_community_ids = scope.orgCommunities;
  }
  const payload = JSON.stringify(payloadObject);
  const payloadPart = bytesToBase64Url(new TextEncoder().encode(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v1.${payloadPart}`)),
  );
  return {
    token: `v1.${payloadPart}.${bytesToBase64Url(mac)}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    allowedCommunityIds,
    userId,
    orgId,
    allowedOrgIds,
  };
}
