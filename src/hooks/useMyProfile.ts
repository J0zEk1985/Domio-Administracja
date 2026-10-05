import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import { TEAM_MEMBERS_QUERY_KEY } from "@/hooks/useTeamMembers";
import { parseProfileFullName } from "@/lib/profileDisplayName";

export const MY_PROFILE_QUERY_KEY = ["my-profile"] as const;

const STALE_MS = 0;
const GC_MS = 30_000;

export type MyProfileData = {
  userId: string;
  fullName: string;
  email: string;
  phone: string;
};

async function fetchMyProfile(): Promise<MyProfileData> {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) {
    console.error("[useMyProfile] getUser:", userErr);
    throw userErr;
  }
  if (!user?.id) {
    throw new Error("Brak zalogowanego użytkownika.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, contact_email, phone")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[useMyProfile] profiles:", error);
    throw error;
  }
  if (!data) {
    throw new Error("Nie znaleziono profilu.");
  }

  return {
    userId: data.id,
    fullName: data.full_name?.trim() ?? "",
    email: data.email?.trim() || data.contact_email?.trim() || user.email?.trim() || "",
    phone: data.phone?.trim() ?? "",
  };
}

export function useMyProfile(enabled: boolean = true) {
  return useQuery({
    queryKey: MY_PROFILE_QUERY_KEY,
    queryFn: fetchMyProfile,
    enabled,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnMount: "always",
  });
}

export function useUpdateMyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { fullName: string; phone: string }) => {
      const profile = await fetchMyProfile();
      const parsed = parseProfileFullName(input.fullName);
      if (!parsed.ok) {
        throw new Error(parsed.message);
      }
      const normalizedPhone = input.phone.trim() === "" ? null : input.phone.trim();
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: parsed.value, phone: normalizedPhone })
        .eq("id", profile.userId);
      if (error) {
        console.error("[useUpdateMyProfile]:", error);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Zapisano profil.");
      void qc.invalidateQueries({ queryKey: MY_PROFILE_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: [TEAM_MEMBERS_QUERY_KEY] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Nie udało się zapisać profilu.";
      toast.error(msg);
      console.error("[useUpdateMyProfile]", e);
    },
  });
}
