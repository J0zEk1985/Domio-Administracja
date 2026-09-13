import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCommunityContactBoard,
  useDeleteContactBoardEntry,
  useSaveContactBoardEntry,
} from "@/hooks/useCommunityContactBoard";
import type { CommunityContactBoardEntry } from "@/types/emergencyDuty";

type Draft = {
  id?: string;
  label: string;
  phone: string;
  email: string;
};

const emptyDraft = (): Draft => ({ label: "", phone: "", email: "" });

export function CommunityContactBoardCard({
  communityId,
  orgId,
  readOnly,
}: {
  communityId: string;
  orgId: string;
  readOnly?: boolean;
}) {
  const { data: rows = [], isLoading } = useCommunityContactBoard(communityId);
  const save = useSaveContactBoardEntry(communityId, orgId);
  const remove = useDeleteContactBoardEntry(communityId);
  const [draft, setDraft] = useState<Draft | null>(null);

  const submit = () => {
    if (!draft) return;
    const label = draft.label.trim();
    if (!label) return;
    save.mutate(
      {
        id: draft.id,
        label,
        phone: draft.phone.trim() || null,
        email: draft.email.trim() || null,
        sort_order: draft.id
          ? (rows.find((r) => r.id === draft.id)?.sort_order ?? rows.length)
          : rows.length,
      },
      { onSuccess: () => setDraft(null) },
    );
  };

  const startEdit = (row: CommunityContactBoardEntry) => {
    setDraft({
      id: row.id,
      label: row.label,
      phone: row.phone ?? "",
      email: row.email ?? "",
    });
  };

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Tablica mieszkańca (Home)</CardTitle>
          <CardDescription>
            Wpisz ręcznie pozycje widoczne w aplikacji Home. Telefon i e-mail są opcjonalne. To nie jest rejestr firm
            pogotowia.
          </CardDescription>
        </div>
        {readOnly ? null : (
          <Button type="button" size="sm" className="gap-1.5" onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-4 w-4" />
            Dodaj pozycję
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Wczytywanie…</p>
        ) : rows.length === 0 && !draft ? (
          <p className="text-sm text-muted-foreground">Brak wpisów na tablicy.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="font-medium">{row.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {[row.phone, row.email].filter(Boolean).join(" · ") || "Brak telefonu i e-maila"}
                  </p>
                </div>
                {readOnly ? null : (
                  <div className="flex gap-1">
                    <Button type="button" size="icon" variant="ghost" onClick={() => startEdit(row)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => remove.mutate(row.id)}
                      disabled={remove.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {draft && !readOnly ? (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="space-y-1.5">
              <Label htmlFor="board-label">Opis</Label>
              <Input
                id="board-label"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="np. Pogotowie techniczne 24h"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="board-phone">Telefon (opcjonalnie)</Label>
                <Input
                  id="board-phone"
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="board-email">E-mail (opcjonalnie)</Label>
                <Input
                  id="board-email"
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={submit} disabled={save.isPending || !draft.label.trim()}>
                Zapisz
              </Button>
              <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                Anuluj
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
