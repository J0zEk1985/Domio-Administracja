import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { CommandInput as CmdkInput } from "cmdk";

import { ISSUE_CATEGORY_OPTIONS } from "@/lib/issueCategoryOptions";
import { useCreateIssue, createIssueSchema, type CreateIssueFormValues } from "@/hooks/useCreateIssue";
import { useProperties, type PropertyListRow } from "@/hooks/useProperties";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type CreateIssueDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselects building (np. karta nieruchomości). */
  defaultLocationId?: string;
};

function LocationCombobox({
  properties,
  isLoading,
  value,
  onChange,
  disabled,
}: {
  properties: PropertyListRow[];
  isLoading: boolean;
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = properties.find((p) => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className="h-10 w-full justify-between font-normal"
        >
          {isLoading ? (
            <Skeleton className="h-4 w-48" />
          ) : (
            <span className="truncate text-left text-sm">
              {selected ? `${selected.name} — ${selected.address}` : "Wybierz budynek…"}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <div className="flex items-center border-b px-2" cmdk-input-wrapper="">
            <Search className="mr-1.5 h-4 w-4 shrink-0 opacity-45" />
            <CmdkInput
              placeholder="Szukaj budynku…"
              className="flex h-10 w-full rounded-md bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <CommandList className="max-h-56">
            <CommandGroup>
              {properties.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.name} ${p.address} ${p.id}`}
                  keywords={[p.name, p.address]}
                  onSelect={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === p.id ? "opacity-100" : "opacity-0")}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{p.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{p.address}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
              Brak budynków.
            </CommandEmpty>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function CreateIssueDialog({ open, onOpenChange, defaultLocationId }: CreateIssueDialogProps) {
  const { data: properties = [], isLoading: propertiesLoading } = useProperties(open);
  const createMut = useCreateIssue();

  const defaultFormValues = useMemo<CreateIssueFormValues>(
    () => ({
      location_id: defaultLocationId ?? "",
      category: "",
      priority: "medium",
      description: "",
    }),
    [defaultLocationId],
  );

  const form = useForm<CreateIssueFormValues>({
    resolver: zodResolver(createIssueSchema),
    defaultValues: defaultFormValues,
  });

  useEffect(() => {
    if (open) {
      form.reset(defaultFormValues);
    }
  }, [open, defaultFormValues, form]);

  function onSubmit(values: CreateIssueFormValues) {
    createMut.mutate(values, {
      onSuccess: () => {
        form.reset({
          location_id: defaultLocationId ?? "",
          category: "",
          priority: "medium",
          description: "",
        });
        onOpenChange(false);
      },
    });
  }

  const pending = createMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nowe zgłoszenie</DialogTitle>
          <DialogDescription>
            Zgłoszenie trafia do lejka jako „Nowe”. Routing i wykonawca wynikają z reguł organizacji — tutaj
            opisujesz tylko potrzebę.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="location_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Budynek</FormLabel>
                  <FormControl>
                    <LocationCombobox
                      properties={properties}
                      isLoading={propertiesLoading}
                      value={field.value}
                      onChange={field.onChange}
                      disabled={pending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kategoria</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || undefined}
                    disabled={pending}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Wybierz kategorię" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ISSUE_CATEGORY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
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
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priorytet</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={pending}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="low">Niski</SelectItem>
                      <SelectItem value="medium">Średni</SelectItem>
                      <SelectItem value="high">Wysoki</SelectItem>
                      <SelectItem value="critical">Krytyczny</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Opis problemu / zlecenie</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Opisz miejsce, zakres i ewentualne zagrożenia (min. 10 znaków)…"
                      rows={5}
                      disabled={pending}
                      className="resize-none min-h-[120px]"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                Anuluj
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                Utwórz zgłoszenie
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
