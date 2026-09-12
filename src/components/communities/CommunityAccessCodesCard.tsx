import { Plus, Trash2 } from "lucide-react";
import type { Control } from "react-hook-form";
import { useFieldArray } from "react-hook-form";
import { ACCESS_CODE_KIND_LABELS, ACCESS_CODE_KINDS, type CommunityDomainFormValues } from "@/schemas/communitySchema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

type Props = {
  control: Control<CommunityDomainFormValues>;
  pending: boolean;
};

export function CommunityAccessCodesCard({ control, pending }: Props) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "access_codes.entries",
  });

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Kody dostępu</CardTitle>
          <CardDescription>
            Otwarta lista — współdzielona dla budynków pod wspólnotą. Lokalizacja jest opcjonalna (np. klatka,
            wejście od podwórka).
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1"
          disabled={pending}
          onClick={() =>
            append({
              id: crypto.randomUUID(),
              kind: "intercom",
              code: "",
              location: "",
            })
          }
        >
          <Plus className="h-4 w-4" aria-hidden />
          Dodaj kod
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Brak kodów — użyj „Dodaj kod”.
          </p>
        ) : (
          fields.map((row, idx) => (
            <div key={row.id}>
              {idx > 0 ? <Separator className="mb-4" /> : null}
              <div className="grid gap-3 md:grid-cols-12 md:items-end">
                <FormField
                  control={control}
                  name={`access_codes.entries.${idx}.kind`}
                  render={({ field }) => (
                    <FormItem className="md:col-span-3">
                      <FormLabel>Typ</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ACCESS_CODE_KINDS.map((kind) => (
                            <SelectItem key={kind} value={kind}>
                              {ACCESS_CODE_KIND_LABELS[kind]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name={`access_codes.entries.${idx}.code`}
                  render={({ field }) => (
                    <FormItem className="md:col-span-4">
                      <FormLabel>Kod</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="off" disabled={pending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name={`access_codes.entries.${idx}.location`}
                  render={({ field }) => (
                    <FormItem className="md:col-span-4">
                      <FormLabel>Lokalizacja (opcjonalnie)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          autoComplete="off"
                          placeholder="np. Klatka A"
                          disabled={pending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex md:col-span-1 md:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    disabled={pending}
                    onClick={() => remove(idx)}
                    aria-label="Usuń kod"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
