/**
 * Edge Function: triage-issue — AI proxy for field-service quick issue triage (OpenAI JSON mode).
 * Secrets: OPENAI_API_KEY (required), SUPABASE_URL + SUPABASE_ANON_KEY (JWT verification).
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Must match `src/lib/issueCategoryOptions.ts` (DB values). */
const ALLOWED_CATEGORIES = [
  "Elektryczna",
  "Hydrauliczna",
  "Ogólnobudowlana",
  "Sprzęt",
  "Sprzątanie doraźne",
  "Prace porządkowe",
] as const;

const ALLOWED_PRIORITIES = ["low", "medium", "high", "critical"] as const;

type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number];
type AllowedPriority = (typeof ALLOWED_PRIORITIES)[number];

type BuildingInput = {
  id: string;
  name: string;
};

type TriageRequestBody = {
  text?: string;
  buildings?: BuildingInput[];
};

type TriageLLMResult = {
  categoryId: string;
  locationId: string;
  priority: string;
  shortDescription: string;
};

type TriageSuccessBody = TriageLLMResult & {
  /** True when locationId is not in the provided buildings list (client should ask user to pick). */
  locationUnrecognized: boolean;
};

function jsonResponse(
  body: unknown,
  status: number,
): Response {
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

function normalizePriority(raw: string): AllowedPriority {
  const t = raw.trim().toLowerCase();
  const ok = ALLOWED_PRIORITIES.find((p) => p === t);
  if (ok) return ok;
  console.warn("[triage-issue] Unrecognized priority, defaulting to medium:", raw);
  return "medium";
}

function parseOpenAIContent(content: string): TriageLLMResult {
  const parsed: unknown = JSON.parse(content);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Model returned non-object JSON");
  }
  const o = parsed as Record<string, unknown>;
  const categoryId = typeof o.categoryId === "string" ? o.categoryId : "";
  const locationId = typeof o.locationId === "string" ? o.locationId : "";
  const priority = typeof o.priority === "string" ? o.priority : "medium";
  const shortDescription = typeof o.shortDescription === "string"
    ? o.shortDescription
    : "";
  return { categoryId, locationId, priority, shortDescription };
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

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      console.error("[triage-issue] OPENAI_API_KEY is not set");
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
    const buildings = Array.isArray(body.buildings) ? body.buildings : [];

    if (!text) {
      return jsonResponse({ error: "Field \"text\" is required" }, 400);
    }
    if (buildings.length === 0) {
      return jsonResponse({ error: "Field \"buildings\" must be a non-empty array" }, 400);
    }

    const validBuildings = buildings.filter((b): b is BuildingInput =>
      typeof b?.id === "string" && isUuid(b.id) && typeof b?.name === "string" && b.name.trim().length > 0
    );
    if (validBuildings.length === 0) {
      return jsonResponse({ error: "No valid buildings (need id UUID + name)" }, 400);
    }

    const buildingIdSet = new Set(validBuildings.map((b) => b.id));

    const systemPrompt =
      `Jesteś asystentem triage zgłoszeń serwisowych dla administratora nieruchomości w Polsce.
Na podstawie dyktowanego lub wklejonego tekstu użytkownika wybierz:
- categoryId: dokładnie jedną z wartości (string po polsku): ${
        ALLOWED_CATEGORIES.join(", ")
      }
- locationId: UUID budynku z podanej listy — musi być identyczny z jednym z id na liście.
- priority: jedna z: low, medium, high, critical
- shortDescription: zwięzły opis problemu po polsku, minimum 10 znaków, bez zmieniania faktów.

Lista budynków (id + nazwa):
${validBuildings.map((b) => `- ${b.id} — ${b.name.trim()}`).join("\n")}

Zwróć WYŁĄCZNIE jeden obiekt JSON z polami: categoryId, locationId, priority, shortDescription.`;

    const userPrompt = `Tekst zgłoszenia:\n"""${text}"""`;

    const model = Deno.env.get("OPENAI_TRIAGE_MODEL") ?? "gpt-4o-mini";

    let openaiRes: Response;
    try {
      openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
    } catch (e) {
      console.error("[triage-issue] OpenAI fetch failed:", e);
      return jsonResponse({ error: "Upstream AI request failed" }, 502);
    }

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("[triage-issue] OpenAI error status:", openaiRes.status, errText);
      return jsonResponse(
        { error: "AI provider error", details: errText.slice(0, 500) },
        502,
      );
    }

    let openaiJson: unknown;
    try {
      openaiJson = await openaiRes.json();
    } catch (e) {
      console.error("[triage-issue] OpenAI response JSON parse failed:", e);
      return jsonResponse({ error: "Invalid AI response" }, 502);
    }

    const content = (openaiJson as { choices?: { message?: { content?: string } }[] })
      ?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      console.error("[triage-issue] Empty OpenAI content:", openaiJson);
      return jsonResponse({ error: "Empty AI content" }, 502);
    }

    let raw: TriageLLMResult;
    try {
      raw = parseOpenAIContent(content);
    } catch (e) {
      console.error("[triage-issue] Failed to parse model JSON:", e, content);
      return jsonResponse({ error: "Invalid AI JSON payload" }, 502);
    }

    const categoryId = normalizeCategory(raw.categoryId);
    const priority = normalizePriority(raw.priority);
    let shortDescription = raw.shortDescription.trim();
    if (shortDescription.length < 10) {
      shortDescription = `${shortDescription} (uzupełnij opis — min. 10 znaków.)`.slice(0, 2000);
      if (shortDescription.length < 10) {
        shortDescription = "Uzupełnij opis zgłoszenia (min. 10 znaków).";
      }
    }

    const locationIdTrim = raw.locationId.trim();
    const locationUnrecognized = !isUuid(locationIdTrim) || !buildingIdSet.has(locationIdTrim);
    const locationId = locationUnrecognized ? "" : locationIdTrim;

    const out: TriageSuccessBody = {
      categoryId,
      locationId,
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
