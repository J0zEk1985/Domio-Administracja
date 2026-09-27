import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";

type Hold = "uncertain" | "jev_unavailable";

type ReviewRow = {
  id: string;
  title: string;
  content: string;
  post_type: "offer" | "request" | "event" | "general";
  created_at: string;
  moderation_hold: Hold | null;
  authorName: string;
  locationName: string;
};

const POST_TYPE_LABEL: Record<ReviewRow["post_type"], string> = {
  offer: "Oferuję usługę",
  request: "Szukam pomocy",
  event: "Wydarzenie",
  general: "Zwykłe ogłoszenie",
};

const HOLD_LABEL: Record<Hold, string> = {
  uncertain: "System nie podjął jednoznacznej decyzji",
  jev_unavailable: "Automatyczna weryfikacja niedostępna",
};

type Props = {
  communityId: string;
  buildingIds: string[];
  canManage: boolean;
};

function isHold(value: string | null): value is Hold {
  return value === "uncertain" || value === "jev_unavailable";
}

async function fetchPending(buildingIds: string[]): Promise<ReviewRow[]> {
  const { data, error } = await supabase
    .from("community_board")
    .select(
      "id, title, content, post_type, created_at, moderation_hold, profiles!community_board_author_id_fkey(full_name), cleaning_locations!community_board_location_id_fkey(name)",
    )
    .eq("status", "pending_review")
    .in("location_id", buildingIds)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[CommunityAnnouncementReview]", error);
    throw error;
  }

  return (data ?? []).map((row) => {
    const author = row.profiles as { full_name: string | null } | null;
    const location = row.cleaning_locations as { name: string | null } | null;
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      post_type: row.post_type,
      created_at: row.created_at,
      moderation_hold: isHold(row.moderation_hold) ? row.moderation_hold : null,
      authorName: author?.full_name?.trim() || "Mieszkaniec",
      locationName: location?.name?.trim() || "Budynek",
    };
  });
}

export function CommunityAnnouncementReviewTab({ communityId, buildingIds, canManage }: Props) {
  const queryClient = useQueryClient();
  const queryKey = ["community-announcement-review", communityId, buildingIds.join(",")] as const;

  const pendingQuery = useQuery({
    queryKey,
    queryFn: () => fetchPending(buildingIds),
    enabled: canManage && buildingIds.length > 0,
  });

  const moderate = useMutation({
    mutationFn: async ({ postId, action }: { postId: string; action: "publish" | "reject" }) => {
      const { error } = await supabase.rpc("moderate_community_announcement", {
        p_community_id: communityId,
        p_post_id: postId,
        p_action: action,
      });
      if (error) {
        console.error("[moderate_community_announcement]", error);
        throw error;
      }
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.action === "publish" ? "Ogłoszenie opublikowane." : "Ogłoszenie odrzucone.");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: () => {
      toast.error("Nie udało się zapisać decyzji.");
    },
  });

  if (!canManage) {
    return <p className="text-sm text-muted-foreground">Ta wspólnota jest nieaktywna.</p>;
  }

  if (buildingIds.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Dodaj co najmniej jeden budynek, aby weryfikować ogłoszenia mieszkańców.
      </p>
    );
  }

  if (pendingQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Wczytywanie ogłoszeń…</p>;
  }

  if (pendingQuery.isError) {
    return <p className="text-sm text-destructive">Nie udało się wczytać ogłoszeń do decyzji.</p>;
  }

  const rows = pendingQuery.data ?? [];
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Brak ogłoszeń oczekujących na decyzję.</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Card key={row.id}>
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-base">{row.title}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {row.authorName} · {row.locationName} · {POST_TYPE_LABEL[row.post_type]} ·{" "}
              {new Date(row.created_at).toLocaleString("pl-PL")}
            </p>
            <p className="text-xs text-foreground">
              {row.moderation_hold ? HOLD_LABEL[row.moderation_hold] : HOLD_LABEL.uncertain}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="whitespace-pre-wrap text-sm text-foreground">{row.content}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={moderate.isPending}
                onClick={() => moderate.mutate({ postId: row.id, action: "publish" })}
              >
                Publikuj
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={moderate.isPending}
                onClick={() => moderate.mutate({ postId: row.id, action: "reject" })}
              >
                Odrzuć
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
