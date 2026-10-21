import { agentSecret } from "./agentRuntimeConfig.ts";
import { withAgentDb } from "./agentRulesStore.ts";
import {
  acceptStyleDraft,
  buildStyleInstructions,
  clipStyleSample,
  mailSamplesToText,
  redactContacts,
} from "./agentStyleDraft.ts";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRAPH = "https://graph.microsoft.com";
const LOGIN = "https://login.microsoftonline.com";
const SENT_URL =
  `${GRAPH}/v1.0/me/mailFolders/sentitems/messages?$select=subject,body,sentDateTime&$top=6&$orderby=sentDateTime%20desc`;
const REAUTH = "Sesja Microsoft 365 wygasła. Połącz konto ponownie w czacie agenta albo wskaż plik tekstowy.";

export class StyleRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function tokenText(value: unknown): string {
  const token = typeof value === "string" ? value : "";
  if (!token || /\s/.test(token) || token.length > 12000) return "";
  return token;
}

async function refreshAccessToken(refreshToken: string, tenantId: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
  const clientId = agentSecret("MS365_CLIENT_ID").toLowerCase();
  const clientSecret = agentSecret("MS365_CLIENT_SECRET");
  if (!GUID.test(clientId) || !clientSecret || /[\r\n]/.test(clientSecret)) {
    throw new StyleRequestError(409, REAUTH);
  }
  const tenant = GUID.test(tenantId) ? tenantId : "organizations";
  let response: Response;
  try {
    response = await fetch(`${LOGIN}/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
      method: "POST",
      redirect: "error",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: `${GRAPH}/Mail.Read offline_access`,
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    console.error("[agent-style] token refresh failed", error instanceof Error ? error.name : "unknown");
    throw new StyleRequestError(503, "Microsoft 365 jest teraz niedostępne. Wskaż plik tekstowy albo spróbuj później.");
  }
  if (response.status === 400 || response.status === 401) throw new StyleRequestError(409, REAUTH);
  if (!response.ok) throw new StyleRequestError(503, "Microsoft 365 jest teraz niedostępne. Wskaż plik tekstowy albo spróbuj później.");
  const payload = asRecord(await response.json().catch(() => null));
  const accessToken = tokenText(payload?.access_token);
  const lifetime = Number(payload?.expires_in);
  if (!accessToken || !Number.isFinite(lifetime) || lifetime <= 0) {
    throw new StyleRequestError(503, "Microsoft 365 jest teraz niedostępne. Wskaż plik tekstowy albo spróbuj później.");
  }
  const rotated = tokenText(payload?.refresh_token) || refreshToken;
  return {
    accessToken,
    refreshToken: rotated,
    expiresAt: new Date(Date.now() + lifetime * 1000).toISOString(),
  };
}

async function loadSentSamples(orgId: string, userId: string): Promise<string> {
  return withAgentDb(async (sql) => {
    const rows = await sql<{ session: unknown }[]>`
      SELECT public.reveal_user_connector_session(${orgId}::uuid, ${userId}::uuid, 'ms365_mail') AS session
    `;
    const session = asRecord(rows[0]?.session);
    if (!session) {
      throw new StyleRequestError(409, "Brak połączonej skrzynki Microsoft 365. Wskaż plik tekstowy albo połącz konto w czacie agenta.");
    }
    if (session.status === "reauth") throw new StyleRequestError(409, REAUTH);
    const refreshToken = tokenText(session.refresh_token);
    const expires = Date.parse(typeof session.expires_at === "string" ? session.expires_at : "");
    let accessToken = tokenText(session.access_token);
    const fresh = Boolean(accessToken) && Number.isFinite(expires) && expires > Date.now() + 60_000;
    if (!fresh) {
      if (!refreshToken) throw new StyleRequestError(409, REAUTH);
      const next = await refreshAccessToken(refreshToken, typeof session.tenant_id === "string" ? session.tenant_id : "");
      accessToken = next.accessToken;
      await sql`
        SELECT public.store_user_connector_session(
          ${orgId}::uuid,
          ${userId}::uuid,
          'ms365_mail',
          ${next.accessToken},
          ${next.refreshToken},
          ${next.expiresAt}::timestamptz,
          NULL,
          ${typeof session.tenant_id === "string" ? session.tenant_id : null},
          'ok',
          false
        )
      `;
    }
    let response: Response;
    try {
      response = await fetch(SENT_URL, {
        method: "GET",
        redirect: "error",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          Prefer: 'outlook.body-content-type="text"',
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      console.error("[agent-style] graph failed", error instanceof Error ? error.name : "unknown");
      throw new StyleRequestError(503, "Nie udało się odczytać wysłanej poczty. Wskaż plik tekstowy albo spróbuj później.");
    }
    if (response.status === 401 || response.status === 403) throw new StyleRequestError(409, REAUTH);
    if (!response.ok) throw new StyleRequestError(503, "Nie udało się odczytać wysłanej poczty. Wskaż plik tekstowy albo spróbuj później.");
    const payload = asRecord(await response.json().catch(() => null));
    const items = Array.isArray(payload?.value) ? payload.value : [];
    const messages = items.map((item) => {
      const row = asRecord(item);
      const body = asRecord(row?.body);
      return {
        subject: typeof row?.subject === "string" ? row.subject : "",
        body: typeof body?.content === "string" ? body.content : "",
      };
    });
    return mailSamplesToText(messages);
  });
}

function geminiText(payload: unknown): string {
  const root = asRecord(payload);
  const candidates = Array.isArray(root?.candidates) ? root.candidates : [];
  const first = asRecord(candidates[0]);
  const content = asRecord(first?.content);
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  return parts
    .map((part) => {
      const row = asRecord(part);
      return row && typeof row.text === "string" ? row.text : "";
    })
    .join("")
    .trim();
}

async function askGemini(sample: string): Promise<string> {
  const key = agentSecret("GEMINI_API_KEY");
  if (key.length < 20) throw new StyleRequestError(503, "Analiza stylu nie jest skonfigurowana (brak klucza modelu).");
  const model = agentSecret("GEMINI_STYLE_MODEL") || "gemini-2.0-flash";
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(model)) throw new StyleRequestError(503, "Analiza stylu nie jest skonfigurowana.");
  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildStyleInstructions() }] },
          contents: [{ role: "user", parts: [{ text: redactContacts(sample) }] }],
          generationConfig: { maxOutputTokens: 800, temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(45000),
      },
    );
  } catch (error) {
    console.error("[agent-style] model failed", error instanceof Error ? error.name : "unknown");
    throw new StyleRequestError(503, "Model nie odpowiedział. Spróbuj ponownie za chwilę.");
  }
  if (!response.ok) {
    console.error("[agent-style] model status", response.status);
    throw new StyleRequestError(503, "Model nie przygotował opisu stylu. Spróbuj ponownie za chwilę.");
  }
  return geminiText(await response.json().catch(() => null));
}

export async function analyzeOperatorStyle(input: {
  orgId: string;
  userId: string;
  useMail: boolean;
  documentText: string;
}): Promise<string> {
  const document = clipStyleSample(input.documentText, 8000);
  const mail = input.useMail ? await loadSentSamples(input.orgId, input.userId) : "";
  const sample = [document, mail].filter((part) => part.length > 0).join("\n---\n").slice(0, 12000);
  if (sample.length < 200) {
    throw new StyleRequestError(
      422,
      "Za mało materiału. Wskaż dłuższy plik tekstowy albo połącz skrzynkę z wysłanymi wiadomościami.",
    );
  }
  const draft = acceptStyleDraft(await askGemini(sample));
  if (!draft) {
    throw new StyleRequestError(422, "Z przesłanego materiału nie da się opisać stałego stylu. Dopisz własną regułę albo wskaż inne pisma.");
  }
  return draft;
}
