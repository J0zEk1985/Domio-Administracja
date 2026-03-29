/**
 * Dodanie członka zespołu administracyjnego — wzorowane na Domio-Cleaning
 * (`AdminDashboardModals.tsx` / ścieżka „Hub”): wyszukanie profilu po e-mailu,
 * weryfikacja braku duplikatu memberships, RPC `link_user_to_org`.
 */
import { supabase } from "@/lib/supabase";

export type AdminTeamRoleCode = "owner" | "admin" | "assistant" | "accountant";

export type ProfileByEmailRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export async function linkAdminTeamMember(
  email: string,
  role: AdminTeamRoleCode,
): Promise<void> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail) {
    throw new Error("Adres e-mail jest wymagany.");
  }

  const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
  if (orgErr) {
    console.error("[linkAdminTeamMember] get_my_org_id_safe:", orgErr);
    throw orgErr;
  }
  if (!orgId || String(orgId).trim() === "") {
    throw new Error("Nie wykryto organizacji. Odśwież stronę lub skontaktuj się z administratorem.");
  }

  const { data: searchResult, error: searchError } = await supabase.rpc("get_profile_by_email", {
    target_email: trimmedEmail,
  });

  if (searchError) {
    console.error("[linkAdminTeamMember] get_profile_by_email:", searchError);
    throw searchError;
  }

  if (!searchResult) {
    throw new Error(
      "Nie znaleziono użytkownika o podanym adresie e-mail. Konto musi być wcześniej zarejestrowane w systemie DOMIO.",
    );
  }

  const userData = searchResult as ProfileByEmailRow;
  const displayName =
    userData.full_name?.trim() ||
    (userData.email?.split("@")[0] ?? trimmedEmail.split("@")[0] ?? "").trim() ||
    "Użytkownik";

  const { data: existingMember } = await supabase
    .from("memberships")
    .select("id")
    .eq("user_id", userData.id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (existingMember) {
    throw new Error("Ten użytkownik jest już przypisany do tej organizacji.");
  }

  const { error: linkError } = await supabase.rpc("link_user_to_org", {
    target_user_id: userData.id,
    target_org_id: orgId,
    target_role: role,
    target_full_name: displayName,
    target_email: trimmedEmail,
  });

  if (linkError) {
    console.error("[linkAdminTeamMember] link_user_to_org:", linkError);
    throw linkError;
  }
}
