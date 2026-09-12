import { useState } from "react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCommunities,
  useUpdateCommunity,
  useDeactivateCommunity,
  communityQueryKeys,
} from "@/hooks/useCommunities";
import { LegalEntityNipField } from "@/components/legal-entity/LegalEntityNipField";
import {
  VerificationNeededBadge,
  rowNeedsVerification,
} from "@/components/legal-entity/VerificationNeededBadge";
import { DeactivateCommunityDialog } from "@/components/communities/DeactivateCommunityDialog";
import { useOrgVerificationAlerts } from "@/hooks/useOrgVerificationAlerts";
import { formatCommunityStatus, isCommunityInactive } from "@/lib/communityStatus";
import { HOUSING_KINDS } from "@/lib/legalEntityMessages";
import type { LegalEntityPublic } from "@/lib/legalEntityApi";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";

const communityFormSchema = z.object({
  name: z.string().min(3, "Minimum 3 znaki"),
  nip: z.string().optional(),
});

type CommunityFormValues = z.infer<typeof communityFormSchema>;

async function fetchMyOrgId(): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_my_org_id_safe");
  if (error) {
    console.error("[Communities] get_my_org_id_safe:", error);
    return null;
  }
  if (data == null || String(data).trim() === "") return null;
  return String(data);
}

export default function Communities() {
  const { data: orgId, isLoading: orgLoading } = useQuery({
    queryKey: ["my-org-id"],
    queryFn: fetchMyOrgId,
  });

  const queryClient = useQueryClient();
  const { data: communities, isPending, isError } = useCommunities(orgId ?? null);
  const { data: verificationAlerts } = useOrgVerificationAlerts(orgId ?? null);
  const updateMutation = useUpdateCommunity();

  const [createOpen, setCreateOpen] = useState(false);
  const [createEntity, setCreateEntity] = useState<LegalEntityPublic | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const deactivateMutation = useDeactivateCommunity();

  const editForm = useForm<CommunityFormValues>({
    resolver: zodResolver(communityFormSchema),
    defaultValues: { name: "", nip: "" },
  });

  const editingRow = editingId ? communities?.find((c) => c.id === editingId) : undefined;
  const deactivateRow = deactivateId ? communities?.find((c) => c.id === deactivateId) : undefined;
  const visibleCommunities = (communities ?? []).filter(
    (c) => showInactive || !isCommunityInactive(c.status),
  );

  const onCreateSubmit = async () => {
    if (!orgId) return;
    if (!createEntity) {
      toast.error("Sprawdź NIP w GUS i dodaj wspólnotę do Domio.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: communityQueryKeys.list(orgId) });
    await queryClient.invalidateQueries({ queryKey: ["verification-alerts"] });
    setCreateOpen(false);
    setCreateEntity(null);
    toast.success(
      createEntity.verificationStatus === "pending_manual"
        ? "Wspólnota dodana. Wymaga sprawdzenia — GUS był niedostępny."
        : "Wspólnota dodana.",
    );
  };

  const onEditOpen = (id: string) => {
    const row = communities?.find((c) => c.id === id);
    if (!row) return;
    setEditingId(id);
    editForm.reset({
      name: row.name,
      nip: row.nip ?? "",
    });
  };

  const onEditSubmit = (values: CommunityFormValues) => {
    if (!orgId || !editingId) return;
    updateMutation.mutate(
      {
        id: editingId,
        orgId,
        updates: {
          name: values.name.trim(),
        },
      },
      {
        onSuccess: () => {
          setEditingId(null);
          toast.success("Zapisano zmiany.");
        },
        onError: (e) => {
          toast.error(e instanceof Error ? e.message : "Nie udało się zapisać.");
        },
      },
    );
  };

  const onDeactivate = () => {
    if (!orgId || !deactivateId) return;
    deactivateMutation.mutate(
      { orgId, communityId: deactivateId },
      {
        onSuccess: () => {
          setDeactivateId(null);
          setEditingId(null);
          toast.success("Wspólnota dezaktywowana. Historia zostaje w archiwum.");
        },
      },
    );
  };

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
      <div className="flex-1 p-6 text-sm text-muted-foreground">
        Brak kontekstu organizacji.
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Wspólnoty</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Wspólnoty i spółdzielnie dodajesz po NIP (GUS). Kody dostępu zostają przy Twojej organizacji.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Switch
              id="show-inactive-communities"
              checked={showInactive}
              onCheckedChange={setShowInactive}
            />
            <Label htmlFor="show-inactive-communities" className="text-sm font-normal cursor-pointer">
              Pokaż nieaktywne
            </Label>
          </div>
          <Button
            onClick={() => {
              setCreateEntity(null);
              setCreateOpen(true);
            }}
          >
            + Nowa Wspólnota
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        {isPending ? (
          <div className="p-6 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : isError ? (
          <div className="p-6 text-sm text-destructive">Nie udało się wczytać listy.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nazwa</TableHead>
                <TableHead>NIP</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data dodania</TableHead>
                <TableHead className="w-[72px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleCommunities.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    {showInactive ? "Brak wspólnot." : "Brak aktywnych wspólnot. Dodaj pierwszą albo pokaż nieaktywne."}
                  </TableCell>
                </TableRow>
              ) : (
                visibleCommunities.map((c) => {
                  const inactive = isCommunityInactive(c.status);
                  return (
                  <TableRow key={c.id} className={inactive ? "opacity-70" : undefined}>
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/communities/${c.id}`} className="text-primary hover:underline">
                          {c.name}
                        </Link>
                        {rowNeedsVerification(verificationAlerts, "community", c.id, c.nip) ? (
                          <VerificationNeededBadge />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{c.nip ?? "—"}</TableCell>
                    <TableCell>{formatCommunityStatus(c.status)}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {format(new Date(c.created_at), "d MMM yyyy", { locale: pl })}
                    </TableCell>
                    <TableCell>
                      {inactive ? null : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onEditOpen(c.id)}
                          aria-label="Edytuj"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateEntity(null);
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Nowa wspólnota</DialogTitle>
            <DialogDescription>
              Zacznij od NIP. Dane rejestrowe pobieramy z GUS. Przy awarii GUS możesz dodać
              wspólnotę ręcznie — trafi do kolejki do sprawdzenia.
            </DialogDescription>
          </DialogHeader>
          {orgId ? (
            <LegalEntityNipField
              orgId={orgId}
              value={createEntity}
              onChange={setCreateEntity}
              allowedKinds={HOUSING_KINDS}
              flags={{ isAdmin: true }}
              required
            />
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Anuluj
            </Button>
            <Button type="button" onClick={() => void onCreateSubmit()} disabled={!createEntity}>
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingId !== null} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Edytuj wspólnotę</DialogTitle>
            <DialogDescription>{editingRow?.name ?? ""}</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nazwa</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="nip"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>NIP (rejestr globalny)</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="off" disabled />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      NIP zmienia wyłącznie administrator platformy DOMIO.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:space-x-0">
                {editingRow && !isCommunityInactive(editingRow.status) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeactivateId(editingRow.id)}
                  >
                    Dezaktywuj
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
                    Anuluj
                  </Button>
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? "Zapisywanie…" : "Zapisz"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <DeactivateCommunityDialog
        open={deactivateId !== null}
        communityName={deactivateRow?.name ?? ""}
        pending={deactivateMutation.isPending}
        onOpenChange={(open) => !open && setDeactivateId(null)}
        onConfirm={onDeactivate}
      />
    </div>
  );
}
