/**
 * Proxies the Łódź bulky-waste schedule lookup.
 * The admin SPA cannot call kartalodzianina.pl directly because of CORS.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { queryLodzBulkWasteSchedule } from "../_shared/lodzBulkWasteScraper.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, schedules: [], error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[lodz-waste-schedule] Missing Authorization header");
      return jsonResponse({ success: false, schedules: [], error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[lodz-waste-schedule] Missing SUPABASE_URL or SUPABASE_ANON_KEY");
      return jsonResponse(
        { success: false, schedules: [], error: "Server misconfiguration" },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user?.id) {
      console.error("[lodz-waste-schedule] auth.getUser failed:", userErr?.message ?? "no user");
      return jsonResponse({ success: false, schedules: [], error: "Unauthorized" }, 401);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      console.error("[lodz-waste-schedule] Invalid JSON body:", error);
      return jsonResponse(
        { success: false, schedules: [], error: "Nieprawidłowe żądanie." },
        400,
      );
    }

    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const street = typeof record.street === "string" ? record.street : "";
    const buildingNumber = typeof record.buildingNumber === "string" ? record.buildingNumber : "";

    const result = await queryLodzBulkWasteSchedule(street, buildingNumber);
    return jsonResponse(result, 200);
  } catch (error) {
    console.error("[lodz-waste-schedule] Unhandled error:", error);
    return jsonResponse(
      {
        success: false,
        schedules: [],
        error: "Nie udało się pobrać harmonogramu UM Łódź.",
      },
      500,
    );
  }
});
