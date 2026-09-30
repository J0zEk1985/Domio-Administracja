import { useEffect, useMemo, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { Copy, Pencil } from "lucide-react";

import { CommunityCreateAnnouncementDialog } from "@/components/communities/CommunityCreateAnnouncementDialog";
import { EBoardColorSwatch } from "@/components/eboard/EBoardColorSwatch";
import { EBoardMessagesToolbar } from "@/components/eboard/EBoardMessagesToolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCommunities } from "@/hooks/useCommunities";
import { useEBoardMessages, type EBoardMessageListItem } from "@/hooks/useEBoardMessages";
import { applyEBoardMessageList, type EBoardSortKey } from "@/lib/eboardMessageList";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/supabase";

type EboardMsgType = Database["public"]["Enums"]["eboard_msg_type"];
type EboardMsgStatus = Database["public"]["Enums"]["eboard_msg_status"];

async function fetchMyOrgId(): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_my_org_id_safe");
  if (error) {
    console.error("[EBoard] get_my_org_id_safe:", error);
    return null;
  }
  if (data == null || String(data).trim() === "") return null;
  return String(data);
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
  if (row.community_id && row.communities?.name) {
    return row.communities.name.trim() || "Wspólnota";
  }
  return "—";
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

export default function EBoard() {
  const { data: orgId, isLoading: orgLoading } = useQuery({
    queryKey: ["my-org-id"],
    queryFn: fetchMyOrgId,
  });

  const { data: rows, isPending, isError } = useEBoardMessages(orgId ?? null);
  const { data: communities = [] } = useCommunities(orgId ?? null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EBoardMessageListItem | null>(null);
  const [displayLinkCommunityId, setDisplayLinkCommunityId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<EBoardSortKey>("created_desc");

  const visibleRows = useMemo(
    () => applyEBoardMessageList(rows ?? [], searchQuery, sortKey),
    [rows, searchQuery, sortKey],
  );

  useEffect(() => {
    if (communities.length > 0 && !displayLinkCommunityId) {
      setDisplayLinkCommunityId(communities[0].id);
    }
  }, [communities, displayLinkCommunityId]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(row: EBoardMessageListItem) {
    setEditing(row);
    setDialogOpen(true);
  }

  function copyDisplayUrlToClipboard() {
    const id = displayLinkCommunityId || communities[0]?.id;
    if (!id) {
      toast.error("Wybierz wspólnotę lub dodaj ogłoszenie z przypisaną wspólnotą.");
      return;
    }
    const url = `${window.location.origin}/display/${id}`;
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        toast.success("Skopiowano link do ekranu.");
      })
      .catch((e) => {
        console.error("[EBoard] clipboard:", e);
        toast.error("Nie udało się skopiować linku.");
      });
  }

  if (orgLoading) {
    return (
      <div className="flex-1 space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="flex-1 p-6 text-sm text-muted-foreground">Brak kontekstu organizacji.</div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Tablica ogłoszeń (E-Board)</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Zarządzanie komunikatami widocznymi dla mieszkańców.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {communities.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={displayLinkCommunityId || communities[0]?.id}
                onValueChange={setDisplayLinkCommunityId}
              >
                <SelectTrigger className="h-9 w-[min(100%,14rem)] text-xs" aria-label="Wspólnota dla linku ekranu">
                  <SelectValue placeholder="Wspólnota" />
                </SelectTrigger>
                <SelectContent>
                  {communities.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => copyDisplayUrlToClipboard()}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Skopiuj link do ekranu
              </Button>
            </div>
          ) : null}
          <Button type="button" onClick={openCreate}>
            + Nowe ogłoszenie
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <EBoardMessagesToolbar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          sortKey={sortKey}
          onSortKeyChange={setSortKey}
        />
      <div className="rounded-md border">
        {isPending ? (
          <div className="space-y-2 p-6">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : isError ? (
          <div className="p-6 text-sm text-destructive">Nie udało się wczytać listy ogłoszeń.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tytuł</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Zasięg</TableHead>
                  <TableHead>Ważne do</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[72px] text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      Brak ogłoszeń.
                    </TableCell>
                  </TableRow>
                ) : visibleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      Brak wyników dla „{searchQuery.trim()}”.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[240px] font-medium">
                        <span className="flex items-start gap-2">
                          <EBoardColorSwatch bg={row.display_bg_color} text={row.display_text_color} />
                          <span className="line-clamp-2">{row.title}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <MsgTypeBadge type={row.msg_type} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{scopeLabel(row)}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {row.valid_until && isValid(parseISO(row.valid_until))
                          ? format(parseISO(row.valid_until), "d MMM yyyy", { locale: pl })
                          : "—"}
                      </TableCell>
                      <TableCell>{formatStatus(row.status)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Edytuj ogłoszenie ${row.title}`}
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      </div>

      <CommunityCreateAnnouncementDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        communities={communities.map((c) => ({ id: c.id, name: c.name }))}
        message={editing}
      />
    </div>
  );
}
