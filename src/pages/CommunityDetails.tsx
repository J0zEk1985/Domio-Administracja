import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useCommunity } from "@/hooks/useCommunities";
import {
  useAssignLocationsToCommunity,
  useLocationsByCommunity,
  useUnassignedOrgLocationsForCommunityDialog,
} from "@/hooks/useProperties";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

async function fetchMyOrgId(): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_my_org_id_safe");
  if (error) {
    console.error("[CommunityDetails] get_my_org_id_safe:", error);
    return null;
  }
  if (data == null || String(data).trim() === "") return null;
  return String(data);
}

export default function CommunityDetails() {
  const { communityId } = useParams<{ communityId: string }>();
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: orgId, isLoading: orgLoading } = useQuery({
    queryKey: ["my-org-id"],
    queryFn: fetchMyOrgId,
  });

  const communityQuery = useCommunity(communityId, orgId ?? null);
  const locationsQuery = useLocationsByCommunity(communityId, {
    enabled: Boolean(communityId && orgId),
  });
  const unassignedQuery = useUnassignedOrgLocationsForCommunityDialog(assignOpen);
  const assignMutation = useAssignLocationsToCommunity(communityId);

  useEffect(() => {
    if (assignOpen) {
      setSelectedIds(new Set());
    }
  }, [assignOpen]);

  if (!communityId) {
    return <Navigate to="/communities" replace />;
  }

  if (orgLoading) {
    return (
      <div className="flex-1 space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full max-w-2xl" />
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="flex-1 p-6 text-sm text-muted-foreground">Brak kontekstu organizacji.</div>
    );
  }

  if (communityQuery.isLoading) {
    return (
      <div className="flex-1 space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full max-w-2xl" />
      </div>
    );
  }

  if (communityQuery.isError || !communityQuery.data) {
    return (
      <div className="flex-1 space-y-4 p-6">
        <Button type="button" variant="ghost" size="sm" className="gap-2 -ml-2 w-fit" asChild>
          <Link to="/communities">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Wróć do listy
          </Link>
        </Button>
        <p className="text-sm text-destructive">
          {communityQuery.error instanceof Error
            ? communityQuery.error.message
            : "Nie znaleziono wspólnoty."}
        </p>
      </div>
    );
  }

  const community = communityQuery.data;

  function toggleLocation(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onAssignSubmit() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    assignMutation.mutate(ids, {
      onSuccess: () => {
        setAssignOpen(false);
        setSelectedIds(new Set());
      },
    });
  }

  const unassigned = unassignedQuery.data ?? [];
  const assigned = locationsQuery.data ?? [];

  return (
    <div className="flex-1 space-y-8 p-6">
      <div className="space-y-4">
        <Button type="button" variant="ghost" size="sm" className="gap-2 -ml-2 w-fit" asChild>
          <Link to="/communities">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Wspólnoty
          </Link>
        </Button>

        <div className="rounded-xl border border-border/60 bg-card/50 p-6 shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{community.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            NIP: <span className="text-foreground/90 tabular-nums">{community.nip?.trim() || "—"}</span>
          </p>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-foreground">Budynki przypisane do wspólnoty</h2>
          <Button type="button" className="gap-1.5 shrink-0" onClick={() => setAssignOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Przypisz budynek
          </Button>
        </div>

        {locationsQuery.isLoading ? (
          <Skeleton className="h-40 w-full rounded-lg" />
        ) : locationsQuery.isError ? (
          <p className="text-sm text-destructive">Nie udało się wczytać budynków.</p>
        ) : assigned.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Brak przypisanych budynków. Użyj przycisku powyżej, aby dodać pierwszy.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa</TableHead>
                  <TableHead>Adres</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {assigned.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.address}</TableCell>
                    <TableCell>
                      <Button variant="link" className="h-auto p-0 text-sm" asChild>
                        <Link to={`/properties/${row.id}`}>Szczegóły</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Przypisz budynki</DialogTitle>
            <DialogDescription>
              Wybierz budynki z organizacji, które nie są jeszcze przypisane do żadnej wspólnoty. Zostaną powiązane z
              tą wspólnotą.
            </DialogDescription>
          </DialogHeader>
          {unassignedQuery.isLoading ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : unassignedQuery.isError ? (
            <p className="text-sm text-destructive">Nie udało się wczytać listy budynków.</p>
          ) : unassigned.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Wszystkie aktywne budynki są już przypisane do wspólnot lub brak budynków do wyboru.
            </p>
          ) : (
            <ScrollArea className="max-h-[min(50vh,320px)] pr-3">
              <ul className="space-y-3">
                {unassigned.map((loc) => (
                  <li key={loc.id} className="flex items-start gap-3 rounded-md border border-border/60 p-3">
                    <Checkbox
                      id={`loc-${loc.id}`}
                      checked={selectedIds.has(loc.id)}
                      onCheckedChange={() => toggleLocation(loc.id)}
                      aria-labelledby={`loc-label-${loc.id}`}
                    />
                    <div className="min-w-0 flex-1">
                      <Label
                        id={`loc-label-${loc.id}`}
                        htmlFor={`loc-${loc.id}`}
                        className="cursor-pointer font-medium leading-snug"
                      >
                        {loc.name}
                      </Label>
                      <p className="text-xs text-muted-foreground">{loc.address}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAssignOpen(false)}>
              Anuluj
            </Button>
            <Button
              type="button"
              disabled={selectedIds.size === 0 || assignMutation.isPending || unassigned.length === 0}
              onClick={onAssignSubmit}
            >
              {assignMutation.isPending ? "Zapisywanie…" : `Przypisz (${selectedIds.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
