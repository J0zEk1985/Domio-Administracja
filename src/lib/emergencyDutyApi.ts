import { supabase } from "@/lib/supabase";

const ERROR_PL: Record<string, string> = {
  ISSUE_AUTH_REQUIRED: "Musisz być zalogowany.",
  EMERGENCY_MANAGE_FORBIDDEN: "Tylko administrator wspólnoty może zgłosić tryb awaryjny.",
  EMERGENCY_VENDOR_MISSING: "Brak firmy pogotowia 24h dla wybranej branży.",
  EMERGENCY_VENDOR_ARGS: "Wybierz wspólnotę i branżę.",
  EMERGENCY_ISSUE_INVALID: "Uzupełnij budynek, branżę i opis (min. 10 znaków).",
  EMERGENCY_LOCATION_FORBIDDEN: "Ten budynek nie należy do Twojej organizacji.",
};

function errMessage(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err ?? "");
  for (const [code, label] of Object.entries(ERROR_PL)) {
    if (raw.includes(code)) return label;
  }
  return raw.trim() || "Operacja awaryjna nie powiodła się.";
}

async function invokeRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) {
    const wrapped = new Error(errMessage(error));
    console.error(`[emergencyDutyApi] ${fn}`, error);
    throw wrapped;
  }
  return data as T;
}

export type CreateEmergencyIssueResult = {
  issue_id: string;
  vendor_id: string;
};

export async function resolveEmergencyVendor(
  communityId: string,
  locationId: string | null,
  tradeCategory: string,
): Promise<string> {
  return invokeRpc<string>("resolve_emergency_vendor", {
    p_community_id: communityId,
    p_location_id: locationId,
    p_trade_category: tradeCategory,
  });
}

export async function createEmergencyIssue(input: {
  locationId: string;
  category: string;
  description: string;
  photosBefore?: string[] | null;
}): Promise<CreateEmergencyIssueResult> {
  return invokeRpc<CreateEmergencyIssueResult>("create_emergency_issue", {
    p_location_id: input.locationId,
    p_category: input.category,
    p_description: input.description,
    p_photos_before: input.photosBefore ?? null,
  });
}
