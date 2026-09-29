import { useEffect } from "react";
import { format, isValid, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CalendarIcon, Loader2 } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateEBoardMessage } from "@/hooks/useEBoardMessages";
import type { CommunityLocationRow } from "@/hooks/useProperties";
import { cn } from "@/lib/utils";

const schema = z.object({
  title: z.string().min(3, "Minimum 3 znaki."),
  content: z.string().min(10, "Minimum 10 znaków."),
  msg_type: z.enum(["official", "advertisement", "resident"]),
  location_id: z.string().optional(),
  valid_until: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: string;
  communityName: string;
  buildings: CommunityLocationRow[];
};

export function CommunityCreateAnnouncementDialog({
  open,
  onOpenChange,
  communityId,
  communityName,
  buildings,
}: Props) {
  const createMut = useCreateEBoardMessage();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      content: "",
      msg_type: "official",
      location_id: "",
      valid_until: "",
    },
  });

  useEffect(() => {
    if (!open) {
      form.reset({
        title: "",
        content: "",
        msg_type: "official",
        location_id: "",
        valid_until: "",
      });
    }
  }, [open, form]);

  function onSubmit(values: FormValues) {
    const locationId =
      values.location_id && values.location_id.trim() !== "" ? values.location_id.trim() : null;
    const validUntil =
      values.valid_until && values.valid_until.trim() !== "" ? values.valid_until.trim() : null;
    createMut.mutate(
      {
        title: values.title,
        content: values.content,
        msg_type: values.msg_type,
        community_id: communityId,
        location_id: locationId,
        valid_until: validUntil,
      },
      {
        onSuccess: () => onOpenChange(false),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nowe ogłoszenie</DialogTitle>
          <DialogDescription>
            Ogłoszenie dla wspólnoty {communityName}. Budynek jest opcjonalny — bez niego komunikat
            obejmuje całą wspólnotę.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
              name="location_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Budynek (opcjonalnie)</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                    value={field.value && field.value !== "" ? field.value : "__none__"}
                    disabled={createMut.isPending}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Cała wspólnota" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">Cała wspólnota (bez budynku)</SelectItem>
                      {buildings.map((b) => (
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

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
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
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
