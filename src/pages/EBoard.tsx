import { useEffect, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { CalendarIcon, Loader2 } from "lucide-react";
import { z } from "zod";

import { supabase } from "@/lib/supabase";
import { useCommunities } from "@/hooks/useCommunities";
import {
  useCreateEBoardMessage,
  useEBoardMessages,
  type EBoardMessageListItem,
} from "@/hooks/useEBoardMessages";
import { useLocationsByCommunity } from "@/hooks/useProperties";
import type { Database } from "@/types/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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

const newMessageSchema = z.object({
  title: z.string().min(3, "Minimum 3 znaki."),
  content: z.string().min(10, "Minimum 10 znaków."),
  msg_type: z.enum(["official", "advertisement", "resident"]),
  community_id: z.string().uuid("Wybierz wspólnotę."),
  location_id: z.string().optional(),
  valid_until: z.string().optional(),
});

type NewMessageFormValues = z.infer<typeof newMessageSchema>;

export default function EBoard() {
  const { data: orgId, isLoading: orgLoading } = useQuery({
    queryKey: ["my-org-id"],
    queryFn: fetchMyOrgId,
  });

  const { data: rows, isPending, isError } = useEBoardMessages(orgId ?? null);
  const { data: communities = [] } = useCommunities(orgId ?? null);
  const createMut = useCreateEBoardMessage();

  const [sheetOpen, setSheetOpen] = useState(false);

  const form = useForm<NewMessageFormValues>({
    resolver: zodResolver(newMessageSchema),
    defaultValues: {
      title: "",
      content: "",
      msg_type: "official",
      community_id: "",
      location_id: "",
      valid_until: "",
    },
  });

  const communityId = form.watch("community_id");

  const { data: communityBuildings = [], isLoading: buildingsLoading } = useLocationsByCommunity(
    communityId || undefined,
    { enabled: sheetOpen && Boolean(communityId) },
  );

  useEffect(() => {
    form.setValue("location_id", "");
  }, [communityId, form]);

  useEffect(() => {
    if (!sheetOpen) {
      form.reset({
        title: "",
        content: "",
        msg_type: "official",
        community_id: "",
        location_id: "",
        valid_until: "",
      });
    }
  }, [sheetOpen, form]);

  function onSubmit(values: NewMessageFormValues) {
    if (!orgId) return;
    const locationId =
      values.location_id && values.location_id.trim() !== "" ? values.location_id.trim() : null;
    const validUntil =
      values.valid_until && values.valid_until.trim() !== "" ? values.valid_until.trim() : null;
    createMut.mutate(
      {
        title: values.title,
        content: values.content,
        msg_type: values.msg_type,
        community_id: values.community_id,
        location_id: locationId,
        valid_until: validUntil,
      },
      {
        onSuccess: () => setSheetOpen(false),
      },
    );
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
        <Button type="button" onClick={() => setSheetOpen(true)}>
          + Nowe ogłoszenie
        </Button>
      </div>

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
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      Brak ogłoszeń.
                    </TableCell>
                  </TableRow>
                ) : (
                  (rows ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[220px] font-medium">
                        <span className="line-clamp-2">{row.title}</span>
                      </TableCell>
                      <TableCell>
                        <MsgTypeBadge type={row.msg_type} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{scopeLabel(row)}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {row.valid_until
                          ? format(parseISO(row.valid_until), "d MMM yyyy", { locale: pl })
                          : "—"}
                      </TableCell>
                      <TableCell>{formatStatus(row.status)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Nowe ogłoszenie</SheetTitle>
            <SheetDescription>Uzupełnij treść i zasięg. Budynek jest opcjonalny.</SheetDescription>
          </SheetHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 flex flex-1 flex-col gap-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tytuł</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Krótki nagłówek" disabled={createMut.isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Treść</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={6}
                        placeholder="Treść ogłoszenia…"
                        disabled={createMut.isPending}
                        className="resize-none"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="msg_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Typ ogłoszenia</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={createMut.isPending}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="official">Oficjalne</SelectItem>
                        <SelectItem value="advertisement">Reklama</SelectItem>
                        <SelectItem value="resident">Mieszkaniec</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="community_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Wspólnota</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || undefined}
                      disabled={createMut.isPending}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz wspólnotę" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {communities.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Budynek (opcjonalnie)</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                      value={field.value && field.value !== "" ? field.value : "__none__"}
                      disabled={createMut.isPending || !communityId || buildingsLoading}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              !communityId
                                ? "Najpierw wybierz wspólnotę"
                                : buildingsLoading
                                  ? "Wczytywanie…"
                                  : "Cała wspólnota"
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Cała wspólnota (bez budynku)</SelectItem>
                        {communityBuildings.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name} — {b.address}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="valid_until"
                render={({ field }) => {
                  const parsed = field.value ? parseISO(field.value) : undefined;
                  const selected = parsed && isValid(parsed) ? parsed : undefined;
                  return (
                    <FormItem className="flex flex-col">
                      <FormLabel>Ważne do (opcjonalnie)</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={createMut.isPending}
                              className={cn(
                                "h-10 w-full justify-start pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground",
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-60" aria-hidden />
                              {selected
                                ? format(selected, "d MMM yyyy", { locale: pl })
                                : "Wybierz datę"}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={selected}
                            onSelect={(d) => field.onChange(d ? format(d, "yyyy-MM-dd") : "")}
                            locale={pl}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <div className="mt-auto flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSheetOpen(false)}
                  disabled={createMut.isPending}
                >
                  Anuluj
                </Button>
                <Button type="submit" disabled={createMut.isPending}>
                  {createMut.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  Opublikuj
                </Button>
              </div>
            </form>
          </Form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
