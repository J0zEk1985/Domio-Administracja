import { useState } from "react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Pencil } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import {
  useCommunities,
  useCreateCommunity,
  useUpdateCommunity,
} from "@/hooks/useCommunities";
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

function formatStatus(status: string | null): string {
  if (status === null || status === "") return "—";
  const s = status.toLowerCase();
  if (s === "active") return "Aktywna";
  if (s === "inactive") return "Nieaktywna";
  if (s === "archived") return "Zarchiwizowana";
  return status;
}

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

  const { data: communities, isPending, isError } = useCommunities(orgId ?? null);
  const createMutation = useCreateCommunity();
  const updateMutation = useUpdateCommunity();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const form = useForm<CommunityFormValues>({
    resolver: zodResolver(communityFormSchema),
    defaultValues: { name: "", nip: "" },
  });

  const editForm = useForm<CommunityFormValues>({
    resolver: zodResolver(communityFormSchema),
    defaultValues: { name: "", nip: "" },
  });

  const editingRow = editingId ? communities?.find((c) => c.id === editingId) : undefined;

  const onCreateSubmit = (values: CommunityFormValues) => {
    if (!orgId) return;
    const nipTrimmed = values.nip?.trim();
    createMutation.mutate(
      {
        name: values.name.trim(),
        org_id: orgId,
        nip: nipTrimmed === undefined || nipTrimmed === "" ? null : nipTrimmed,
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          form.reset({ name: "", nip: "" });
          toast.success("Wspólnota utworzona.");
        },
        onError: (e) => {
          toast.error(e instanceof Error ? e.message : "Nie udało się utworzyć wspólnoty.");
        },
      },
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
    const nipTrimmed = values.nip?.trim();
    updateMutation.mutate(
      {
        id: editingId,
        orgId,
        updates: {
          name: values.name.trim(),
          nip: nipTrimmed === undefined || nipTrimmed === "" ? null : nipTrimmed,
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
            Zarządzaj wspólnotami przypisanymi do organizacji.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ Nowa Wspólnota</Button>
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
              {communities?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Brak wspólnot. Dodaj pierwszą.
                  </TableCell>
                </TableRow>
              ) : (
                communities?.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.nip ?? "—"}</TableCell>
                    <TableCell>{formatStatus(c.status)}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {format(new Date(c.created_at), "d MMM yyyy", { locale: pl })}
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Nowa wspólnota</DialogTitle>
            <DialogDescription>Podaj nazwę (min. 3 znaki). NIP jest opcjonalny.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onCreateSubmit)} className="space-y-4">
              <FormField
                control={form.control}
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
                control={form.control}
                name="nip"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>NIP</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Anuluj
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Zapisywanie…" : "Utwórz"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
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
                    <FormLabel>NIP</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
                  Anuluj
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Zapisywanie…" : "Zapisz"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
