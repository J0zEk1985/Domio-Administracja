import { useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { Pencil } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CommunityCreateAnnouncementDialog } from "@/components/communities/CommunityCreateAnnouncementDialog";
import {
  EBOARD_DEFAULT_BG,
  EBOARD_DEFAULT_TEXT,
  isHexColor,
} from "@/lib/eboardDisplayColors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useEBoardMessagesForCommunity,
  type EBoardMessageListItem,
} from "@/hooks/useEBoardMessages";
import type { CommunityLocationRow } from "@/hooks/useProperties";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/supabase";

type Hold = "uncertain" | "jev_unavailable";
type EboardMsgType = Database["public"]["Enums"]["eboard_msg_type"];
type EboardMsgStatus = Database["public"]["Enums"]["eboard_msg_status"];

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
  communityName: string;
  buildingIds: string[];
  buildings: CommunityLocationRow[];
  canManage: boolean;
};

function isHold(value: string | null): value is Hold {
  return value === "uncertain" || value === "jev_unavailable";
}

function formatMsgType(t: EboardMsgType): string {
  if (t === "official") return "Oficjalne";
  if (t === "advertisement") return "Reklama";
  if (t === "resident") return "Mieszkaniec";
  return t;
}

function formatStatus(s: EboardMsgStatus): string {
  if (s === "published") return "Opublikowane";
  if (s === "pending_moderation") return "Oczekuje";
  if (s === "archived") return "Zarchiwizowane";
  return s;
}

function scopeLabel(row: EBoardMessageListItem): string {
  if (row.location_id && row.cleaning_locations?.name) {
    return row.cleaning_locations.name.trim() || "Budynek";
  }
  return "Cała wspólnota";
}

function MsgTypeBadge({ type }: { type: EboardMsgType }) {
  const label = formatMsgType(type);
  if (type === "official") {
    return (
      <Badge className="border-transparent bg-blue-600 text-white hover:bg-blue-600/90">{label}</Badge>
    );
  }
  if (type === "advertisement") {
    return (
      <Badge className="border-transparent bg-violet-600 text-white hover:bg-violet-600/90">{label}</Badge>
    );
  }
  return (
    <Badge className="border-transparent bg-slate-600 text-white hover:bg-slate-600/90">{label}</Badge>
  );
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

export function CommunityAnnouncementReviewTab({
  communityId,
  communityName,
  buildingIds,
  buildings,
  canManage,
}: Props) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EBoardMessageListItem | null>(null);
  const queryKey = ["community-announcement-review", communityId, buildingIds.join(",")] as const;

  const boardQuery = useEBoardMessagesForCommunity(communityId);

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

  const pendingRows = pendingQuery.data ?? [];
  const boardRows = boardQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Tablica ogłoszeń</h3>
          <p className="text-xs text-muted-foreground">
            Komunikaty widoczne dla mieszkańców tej wspólnoty.
          </p>
        </div>
        {canManage ? (
          <Button type="button" onClick={() => setCreateOpen(true)}>
            + Nowe ogłoszenie
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Ta wspólnota jest nieaktywna.</p>
        )}
      </div>

      {boardQuery.isPending ? (
        <Skeleton className="h-32 w-full rounded-lg" />
      ) : boardQuery.isError ? (
        <p className="text-sm text-destructive">Nie udało się wczytać ogłoszeń tablicy.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tytuł</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Zasięg</TableHead>
                <TableHead>Ważne do</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead className="w-[72px] text-right">Akcje</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {boardRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 6 : 5} className="text-center text-sm text-muted-foreground">
                    Brak ogłoszeń na tablicy. Dodaj pierwsze przyciskiem powyżej.
                  </TableCell>
                </TableRow>
              ) : (
                boardRows.map((row) => {
                  const until = row.valid_until ? parseISO(row.valid_until) : null;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[220px] font-medium">
                        <span className="line-clamp-2">{row.title}</span>
                      </TableCell>
                      <TableCell>
                        <MsgTypeBadge type={row.msg_type} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{scopeLabel(row)}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {until && isValid(until) ? format(until, "d MMM yyyy", { locale: pl }) : "—"}
                      </TableCell>
                      <TableCell>{formatStatus(row.status)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-base font-semibold text-foreground">Ogłoszenia oczekujące na decyzję</h3>
        {!canManage ? (
          <p className="text-sm text-muted-foreground">Ta wspólnota jest nieaktywna.</p>
        ) : buildingIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Dodaj co najmniej jeden budynek, aby weryfikować ogłoszenia mieszkańców.
          </p>
        ) : pendingQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Wczytywanie ogłoszeń…</p>
        ) : pendingQuery.isError ? (
          <p className="text-sm text-destructive">Nie udało się wczytać ogłoszeń do decyzji.</p>
        ) : pendingRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak ogłoszeń oczekujących na decyzję.</p>
        ) : (
          pendingRows.map((row) => (
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
          ))
        )}
      </div>

      <CommunityCreateAnnouncementDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        communityId={communityId}
        communityName={communityName}
        buildings={buildings}
      />
    </div>
  );
}
