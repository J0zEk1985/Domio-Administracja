/**
 * Signs the DOMIO user token checked by agent-n8n/scripts/agent-user-token.mjs.
 * Payload keys, in this order: operator_id, allowed_community_ids, exp.
 * Token: v1.<base64url(json)>.<base64url(hmac-sha256(secret, "v1." + payload))>
 */

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
): Promise<{ token: string; expiresAt: string; allowedCommunityIds: string[] }> {
  const operator = operatorId.trim().toLowerCase();
  if (!SCOPE_ID.test(operator) || secret.trim().length < 16) {
    throw new Error("Nie można podpisać tożsamości agenta.");
  }
  const allowedCommunityIds = normalizeCommunityIds(communityIds);
  const exp = Math.floor(nowMs / 1000) + TOKEN_TTL_SECONDS;
  const payload = JSON.stringify({
    operator_id: operator,
    allowed_community_ids: allowedCommunityIds,
    exp,
  });
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
  };
}
