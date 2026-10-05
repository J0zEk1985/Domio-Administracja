import { supabase } from "@/lib/supabase";
import { parseProfileFullName } from "@/lib/profileDisplayName";

export async function updateProfileFullName(userId: string, rawName: string): Promise<string> {
  const parsed = parseProfileFullName(rawName);
  if (!parsed.ok) {
    throw new Error(parsed.message);
  }

  const { error } = await supabase.from("profiles").update({ full_name: parsed.value }).eq("id", userId);
  if (error) {
    console.error("[updateProfileFullName]:", error);
    throw error;
  }
  return parsed.value;
}
