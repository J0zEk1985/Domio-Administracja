/**
 * Edge Function: triage-issue — AI proxy (Gemini 1.5 Flash, JSON schema).
 * Secrets: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY (JWT verification).
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-1.5-flash";

/** Must match `src/lib/issueCategoryOptions.ts` (DB values). */
const ALLOWED_CATEGORIES = [
  "Elektryczna",
  "Hydrauliczna",
  "Ogólnobudowlana",
  "Sprzęt",
  "Sprzątanie doraźne",
  "Prace porządkowe",
] as const;

const ALLOWED_PRIORITIES_EN = ["low", "medium", "high", "critical"] as const;

type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number];
type AllowedPriority = (typeof ALLOWED_PRIORITIES_EN)[number];

type LocationInput = {
  id: string;
  name: string;
  community_id: string;
};

type TriageRequestBody = {
  text?: string;
  locations?: LocationInput[];
};

type TriageLLMResult = {
  categoryId: string;
  locationId: string;
  communityId: string;
  priority: string;
  shortDescription: string;
};

type TriageSuccessBody = {
  categoryId: AllowedCategory;
  locationId: string;
  communityId: string;
  priority: AllowedPriority;
  shortDescription: string;
  locationUnrecognized: boolean;
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim(),
  );
}

function normalizeCategory(raw: string): AllowedCategory {
  const t = raw.trim();
  const exact = ALLOWED_CATEGORIES.find((c) => c === t);
  if (exact) return exact;
  const lower = t.toLowerCase();
  const fuzzy = ALLOWED_CATEGORIES.find((c) => c.toLowerCase() === lower);
  if (fuzzy) return fuzzy;
  console.warn("[triage-issue] Unrecognized category, defaulting to Ogólnobudowlana:", raw);
  return "Ogólnobudowlana";
}

/** Model may return Polish labels (schema); map to RHF / DB values. */
function normalizePriorityToEnglish(raw: string): AllowedPriority {
  const t = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  const pl: Record<string, AllowedPriority> = {
    niski: "low",
    sredni: "medium",
    wysoki: "high",
    krytyczny: "critical",
  };
  if (pl[t]) return pl[t];

  const en = ALLOWED_PRIORITIES_EN.find((p) => p === t);
  if (en) return en;

  console.warn("[triage-issue] Unrecognized priority, defaulting to medium:", raw);
  return "medium";
}

function parseTriageJson(text: string): TriageLLMResult {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Model returned non-object JSON");
  }
  const o = parsed as Record<string, unknown>;
  return {
    categoryId: typeof o.categoryId === "string" ? o.categoryId : "",
    locationId: typeof o.locationId === "string" ? o.locationId : "",
    communityId: typeof o.communityId === "string" ? o.communityId : "",
    priority: typeof o.priority === "string" ? o.priority : "sredni",
    shortDescription: typeof o.shortDescription === "string" ? o.shortDescription : "",
  };
}

function extractGeminiText(data: unknown): string | null {
  const root = data as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
  };
  const text = root?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === "string" ? text : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[triage-issue] Missing or invalid Authorization header");
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[triage-issue] Missing SUPABASE_URL or SUPABASE_ANON_KEY");
      return jsonResponse({ error: "Server misconfiguration" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user?.id) {
      console.error("[triage-issue] auth.getUser failed:", userErr?.message ?? "no user");
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      console.error("[triage-issue] GEMINI_API_KEY is not set");
      return jsonResponse({ error: "AI service unavailable" }, 503);
    }

    let body: TriageRequestBody;
    try {
      body = await req.json() as TriageRequestBody;
    } catch (e) {
      console.error("[triage-issue] Invalid JSON body:", e);
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    const locations = Array.isArray(body.locations) ? body.locations : [];

    if (!text) {
      return jsonResponse({ error: 'Field "text" is required' }, 400);
    }
    if (locations.length === 0) {
      return jsonResponse({ error: 'Field "locations" must be a non-empty array' }, 400);
    }

    const validLocs = locations.filter((l): l is LocationInput =>
      typeof l?.id === "string" &&
      isUuid(l.id) &&
      typeof l?.name === "string" &&
      l.name.trim().length > 0 &&
      typeof l?.community_id === "string"
    );
    if (validLocs.length === 0) {
      return jsonResponse(
        { error: "No valid locations (need id UUID, name, community_id string)" },
        400,
      );
    }

    const locationById = new Map(validLocs.map((l) => [l.id, l]));

    const systemText =
      `Jesteś asystentem zarządcy nieruchomości. Użytkownik dyktuje usterkę. Masz listę dostępnych budynków. Zwróć WYŁĄCZNIE poprawny JSON w formacie: { 'categoryId': '...', 'locationId': '...', 'communityId': '...', 'priority': 'niski|sredni|wysoki|krytyczny', 'shortDescription': '...' }. Dopasuj budynek z listy do dyktowanego tekstu.

Dozwolone categoryId (dokładnie jedna wartość): ${ALLOWED_CATEGORIES.join(", ")}.

Lista budynków (id, nazwa, community_id):
${validLocs.map((l) => `- ${l.id} | ${l.name.trim()} | community_id=${l.community_id || "(puste)"}`).join("\n")}

Priorytet w polu priority musi być dokładnie jednym z: niski, sredni, wysoki, krytyczny.
shortDescription: po polsku, minimum 10 znaków, bez zmieniania faktów.`;

    const userText = `Treść zgłoszenia:\n"""${text}"""`;

    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${
        encodeURIComponent(geminiKey)
      }`;

    const responseJsonSchema = {
      type: "object",
      properties: {
        categoryId: { type: "string" },
        locationId: { type: "string" },
        communityId: { type: "string" },
        priority: {
          type: "string",
          enum: ["niski", "sredni", "wysoki", "krytyczny"],
        },
        shortDescription: { type: "string" },
      },
      required: ["categoryId", "locationId", "communityId", "priority", "shortDescription"],
    };

    let geminiRes: Response;
    try {
      geminiRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemText }],
          },
          contents: [
            {
              parts: [{ text: userText }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseJsonSchema,
          },
        }),
      });
    } catch (e) {
      console.error("[triage-issue] Gemini fetch failed:", e);
      return jsonResponse({ error: "Upstream AI request failed" }, 502);
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("[triage-issue] Gemini error status:", geminiRes.status, errText);
      return jsonResponse(
        { error: "AI provider error", details: errText.slice(0, 500) },
        502,
      );
    }

    let geminiJson: unknown;
    try {
      geminiJson = await geminiRes.json();
    } catch (e) {
      console.error("[triage-issue] Gemini response JSON parse failed:", e);
      return jsonResponse({ error: "Invalid AI response" }, 502);
    }

    const rawText = extractGeminiText(geminiJson);
    if (!rawText?.trim()) {
      console.error("[triage-issue] Empty Gemini text:", geminiJson);
      return jsonResponse({ error: "Empty AI content" }, 502);
    }

    let raw: TriageLLMResult;
    try {
      raw = parseTriageJson(rawText.trim());
    } catch (e) {
      console.error("[triage-issue] Failed to parse model JSON:", e, rawText);
      return jsonResponse({ error: "Invalid AI JSON payload" }, 502);
    }

    const categoryId = normalizeCategory(raw.categoryId);
    const priority = normalizePriorityToEnglish(raw.priority);

    let shortDescription = raw.shortDescription.trim();
    if (shortDescription.length < 10) {
      shortDescription = `${shortDescription} (uzupełnij opis — min. 10 znaków.)`.slice(0, 2000);
      if (shortDescription.length < 10) {
        shortDescription = "Uzupełnij opis zgłoszenia (min. 10 znaków).";
      }
    }

    const locationIdTrim = raw.locationId.trim();
    const locationUnrecognized = !isUuid(locationIdTrim) || !locationById.has(locationIdTrim);
    const locationId = locationUnrecognized ? "" : locationIdTrim;

    const resolvedLoc = locationId ? locationById.get(locationId) : undefined;
    const communityId = resolvedLoc
      ? (resolvedLoc.community_id?.trim() ?? "")
      : "";

    const out: TriageSuccessBody = {
      categoryId,
      locationId,
      communityId,
      priority,
      shortDescription,
      locationUnrecognized,
    };

    return jsonResponse(out, 200);
  } catch (e) {
    console.error("[triage-issue] Unhandled error:", e);
    return jsonResponse(
      {
        error: "Internal server error",
        details: e instanceof Error ? e.message : String(e),
      },
      500,
    );
  }
});
