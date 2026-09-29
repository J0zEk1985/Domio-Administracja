import { format, isValid, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import type { UseFormReturn } from "react-hook-form";
import { CalendarIcon } from "lucide-react";

import { EBoardDisplayColorFields } from "@/components/eboard/EBoardDisplayColorFields";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
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
import type { CommunityLocationRow } from "@/hooks/useProperties";
import { EBOARD_DEFAULT_BG, EBOARD_DEFAULT_TEXT } from "@/lib/eboardDisplayColors";
import type { EboardMessageFormValues } from "@/lib/eboardMessageForm";
import { cn } from "@/lib/utils";

type CommunityOption = { id: string; name: string };

type Props = {
  form: UseFormReturn<EboardMessageFormValues>;
  pending: boolean;
  showCommunitySelect: boolean;
  communities: CommunityOption[];
  fetchCommunityId: string;
  buildings: CommunityLocationRow[];
  buildingsLoading: boolean;
};

export function EBoardMessageFormFields({
  form,
  pending,
  showCommunitySelect,
  communities,
  fetchCommunityId,
  buildings,
  buildingsLoading,
}: Props) {
  return (
    <>
      <FormField
        control={form.control}
        name="title"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Tytuł</FormLabel>
            <FormControl>
              <Input {...field} placeholder="Krótki nagłówek" disabled={pending} />
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
                disabled={pending}
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
            <Select onValueChange={field.onChange} value={field.value} disabled={pending}>
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

      {showCommunitySelect ? (
        <FormField
          control={form.control}
          name="community_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Wspólnota</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || undefined} disabled={pending}>
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
      ) : null}

      <FormField
        control={form.control}
        name="location_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Budynek (opcjonalnie)</FormLabel>
            <Select
              onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
              value={field.value && field.value !== "" ? field.value : "__none__"}
              disabled={pending || !fetchCommunityId || buildingsLoading}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !fetchCommunityId
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
                      disabled={pending}
                      className={cn(
                        "h-10 w-full justify-start pl-3 text-left font-normal",
                        !field.value && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-60" aria-hidden />
                      {selected ? format(selected, "d MMM yyyy", { locale: pl }) : "Wybierz datę"}
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

      <EBoardDisplayColorFields
        control={form.control}
        disabled={pending}
        onResetDefaults={() => {
          form.setValue("display_bg_color", EBOARD_DEFAULT_BG, { shouldValidate: true });
          form.setValue("display_text_color", EBOARD_DEFAULT_TEXT, { shouldValidate: true });
        }}
      />
    </>
  );
}
