import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  searchEstateInviteHits,
  useCommunityEstate,
  useCreateEstate,
  useEstateMembers,
  useInviteEstateCommunity,
  useRespondEstateInvite,
  useWithdrawEstateMembership,
} from "@/hooks/useCommunityEstate";
import type { EstateInviteSearchHit, EstateMemberStatus } from "@/lib/estateApi";

const STATUS_LABEL: Record<EstateMemberStatus, string> = {
  invited: "Zaproszenie",
  accepted: "Dołączona",
  rejected: "Odrzucona",
  withdrawn: "Wypisana",
};

function statusVariant(status: EstateMemberStatus): "default" | "secondary" | "outline" | "destructive" {
  if (status === "accepted") return "default";
  if (status === "rejected") return "destructive";
  if (status === "invited") return "secondary";
  return "outline";
}

type CommunityEstateTabProps = {
  communityId: string;
  communityName: string;
};

export function CommunityEstateTab({ communityId, communityName }: CommunityEstateTabProps) {
  const estateQuery = useCommunityEstate(communityId);
  const estate = estateQuery.data ?? null;
  const estateId = estate?.estateId ?? null;
  const membersQuery = useEstateMembers(estate?.memberStatus === "accepted" ? estateId : null);

  const createEstate = useCreateEstate(communityId);
  const invite = useInviteEstateCommunity(communityId, estateId);
  const respond = useRespondEstateInvite(communityId, estateId);
  const withdraw = useWithdrawEstateMembership(communityId, estateId);

  const [newName, setNewName] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [hits, setHits] = useState<EstateInviteSearchHit[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setSearchError(null);
    setSearchBusy(true);
    try {
      const rows = await searchEstateInviteHits(searchQ, estateId);
      setHits(rows);
    } catch (err) {
      console.error("[CommunityEstateTab] search:", err);
      setHits([]);
      setSearchError(err instanceof Error ? err.message : "Nie udało się wyszukać.");
    } finally {
      setSearchBusy(false);
    }
  }

  if (estateQuery.isLoading) {
    return <Skeleton className="h-48 w-full rounded-lg" />;
  }

  if (estateQuery.isError) {
    return (
      <p className="text-sm text-destructive">
        {estateQuery.error instanceof Error ? estateQuery.error.message : "Nie udało się wczytać osiedla."}
      </p>
    );
  }

  if (!estate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Osiedle społeczne</CardTitle>
          <CardDescription>
            Wspólna tablica sąsiedzka dla kilku wspólnot (także różnych zarządców). Usterki, oficjalne ogłoszenia i
            przeglądy zostają przy każdej wspólnocie osobno.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="estate-name">Nazwa osiedla</Label>
            <Input
              id="estate-name"
              value={newName}
              onChange={(ev) => setNewName(ev.target.value)}
              placeholder={`np. Osiedle przy ${communityName}`}
            />
          </div>
          <Button
            type="button"
            disabled={createEstate.isPending || newName.trim().length < 2}
            onClick={() => createEstate.mutate(newName.trim())}
          >
            {createEstate.isPending ? "Tworzenie…" : "Utwórz osiedle"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isInvited = estate.memberStatus === "invited";
  const isAccepted = estate.memberStatus === "accepted";
  const members = membersQuery.data ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{estate.estateName}</CardTitle>
          <CardDescription>
            {isInvited
              ? "Ta wspólnota została zaproszona do osiedla. Po akceptacji mieszkańcy zobaczą wspólną tablicę sąsiedzką."
              : "Tablica sąsiedzka jest wspólna. Usterki, ogłoszenia zarządu i przeglądy pozostają per wspólnota."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(estate.memberStatus)}>{STATUS_LABEL[estate.memberStatus]}</Badge>
          {isInvited ? (
            <>
              <Button
                type="button"
                size="sm"
                disabled={respond.isPending}
                onClick={() => respond.mutate({ memberId: estate.memberId, accept: true })}
              >
                Akceptuj
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={respond.isPending}
                onClick={() => respond.mutate({ memberId: estate.memberId, accept: false })}
              >
                Odrzuć
              </Button>
            </>
          ) : null}
          {isAccepted ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={withdraw.isPending}
              onClick={() => withdraw.mutate(estate.memberId)}
            >
              Wypisz wspólnotę
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {isAccepted ? (
        <>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Członkowie osiedla</h3>
            {membersQuery.isLoading ? (
              <Skeleton className="h-32 w-full rounded-lg" />
            ) : membersQuery.isError ? (
              <p className="text-sm text-destructive">Nie udało się wczytać listy wspólnot.</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Wspólnota</TableHead>
                      <TableHead>NIP</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[140px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((row) => (
                      <TableRow key={row.memberId}>
                        <TableCell className="font-medium">
                          {row.communityName}
                          {row.isOwn ? (
                            <span className="ml-2 text-xs text-muted-foreground">(ta wspólnota)</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{row.nip?.trim() || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(row.status)}>{STATUS_LABEL[row.status]}</Badge>
                        </TableCell>
                        <TableCell>
                          {row.status === "invited" && (row.isOwn || estate.createdByOrgId) ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={withdraw.isPending}
                              onClick={() => withdraw.mutate(row.memberId)}
                            >
                              Anuluj
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Zaproś wspólnotę</h3>
            <p className="text-sm text-muted-foreground">
              Szukaj po NIP lub nazwie prawnej. Nie pokazujemy pełnej listy wspólnot w DOMIO.
            </p>
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={onSearch}>
              <Input
                value={searchQ}
                onChange={(ev) => setSearchQ(ev.target.value)}
                placeholder="NIP lub nazwa wspólnoty"
                className="sm:max-w-sm"
              />
              <Button type="submit" variant="secondary" disabled={searchBusy || searchQ.trim().length < 3}>
                {searchBusy ? "Szukanie…" : "Szukaj"}
              </Button>
            </form>
            {searchError ? <p className="text-sm text-destructive">{searchError}</p> : null}
            {hits.length > 0 ? (
              <ul className="space-y-2">
                {hits.map((hit) => {
                  const disabled = hit.isOwn || hit.linkStatus === "accepted" || hit.linkStatus === "invited";
                  return (
                    <li
                      key={hit.communityId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{hit.displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          NIP: {hit.nip?.trim() || "—"}
                          {hit.isOwn ? " · Twoja wspólnota" : ""}
                          {hit.linkStatus ? ` · ${STATUS_LABEL[hit.linkStatus]}` : ""}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={disabled || invite.isPending}
                        onClick={() => invite.mutate(hit.communityId)}
                      >
                        Zaproś
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
