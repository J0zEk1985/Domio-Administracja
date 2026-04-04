import { useEffect, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import { Plus, Trash2, Headphones, Loader2 } from "lucide-react";
import type { Database } from "@/types/supabase";
import {
  communityDomainFormSchema,
  computeCommunityContractNetPln,
  parseJsonToAccessCodes,
  parseJsonToBoardMembers,
  parseJsonToFinancialDetails,
  parseJsonToOperationalNotes,
  type CommunityDomainFormValues,
} from "@/schemas/communitySchema";
import { isValidOptionalEmail } from "@/types/propertyAdminData";
import { useUpdateCommunity } from "@/hooks/useCommunities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";

type CommunityRow = Database["public"]["Tables"]["communities"]["Row"];

type Props = {
  community: CommunityRow;
  orgId: string;
};

function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "#";
}

function parseOptionalNumber(raw: string): number | null {
  if (raw === "") return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function CommunityDomainEditor({ community, orgId }: Props) {
  const update = useUpdateCommunity();

  const defaults = useMemo((): CommunityDomainFormValues => {
    return {
      name: community.name?.trim() || "",
      legal_name: community.legal_name ?? null,
      nip: community.nip ?? null,
      regon: community.regon ?? null,
      board_email: community.board_email ?? null,
      financial_details: parseJsonToFinancialDetails(community.financial_details),
      access_codes: parseJsonToAccessCodes(community.access_codes),
      operational_notes: parseJsonToOperationalNotes(community.operational_notes),
      board_members: parseJsonToBoardMembers(community.board_members),
    };
  }, [community]);

  const form = useForm<CommunityDomainFormValues>({
    resolver: zodResolver(communityDomainFormSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    form.reset(defaults);
  }, [community.id, defaults, form]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "board_members",
  });

  const financeWatch = form.watch("financial_details");
  const netPln = useMemo(() => computeCommunityContractNetPln(financeWatch), [financeWatch]);
  const netFormatted = useMemo(
    () =>
      new Intl.NumberFormat("pl-PL", {
        style: "currency",
        currency: "PLN",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(netPln),
    [netPln],
  );

  function onSubmit(values: CommunityDomainFormValues) {
    const be = values.board_email?.trim() ?? "";
    if (!isValidOptionalEmail(be)) {
      toast.error("Niepoprawny adres e-mail zarządu.");
      return;
    }
    for (const m of values.board_members) {
      if (!isValidOptionalEmail(m.email ?? "")) {
        toast.error(`Niepoprawny e-mail w zarządzie${m.fullName.trim() ? ` (${m.fullName.trim()})` : ""}.`);
        return;
      }
    }

    const updates: Database["public"]["Tables"]["communities"]["Update"] = {
      name: values.name.trim(),
      legal_name: values.legal_name?.trim() || null,
      nip: values.nip?.trim() || null,
      regon: values.regon?.trim() || null,
      board_email: be === "" ? null : be,
      financial_details: values.financial_details as Database["public"]["Tables"]["communities"]["Row"]["financial_details"],
      access_codes: values.access_codes as Database["public"]["Tables"]["communities"]["Row"]["access_codes"],
      operational_notes: values.operational_notes as Database["public"]["Tables"]["communities"]["Row"]["operational_notes"],
      board_members: values.board_members as unknown as Database["public"]["Tables"]["communities"]["Row"]["board_members"],
    };

    update.mutate(
      { id: community.id, orgId, updates },
      {
        onSuccess: () => {
          toast.success("Zapisano dane wspólnoty.");
        },
      },
    );
  }

  const pending = update.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Tabs defaultValue="core" className="w-full">
          <TabsList className="grid h-auto w-full max-w-4xl grid-cols-2 gap-1 p-1 sm:grid-cols-3 lg:grid-cols-6">
            <TabsTrigger value="core" className="text-xs sm:text-sm">
              Podstawowe
            </TabsTrigger>
            <TabsTrigger value="finance" className="text-xs sm:text-sm">
              Finanse
            </TabsTrigger>
            <TabsTrigger value="formal" className="text-xs sm:text-sm">
              Dane formalne
            </TabsTrigger>
            <TabsTrigger value="board" className="text-xs sm:text-sm">
              Zarząd
            </TabsTrigger>
            <TabsTrigger value="codes" className="text-xs sm:text-sm">
              Kody
            </TabsTrigger>
            <TabsTrigger value="notes" className="text-xs sm:text-sm">
              Uwagi
            </TabsTrigger>
          </TabsList>

          <TabsContent value="core" className="mt-4">
            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Identyfikacja</CardTitle>
                <CardDescription>Nazwa skrócona i pełna nazwa prawna wspólnoty.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Nazwa (skrót)</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={pending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="legal_name"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Pełna nazwa prawna</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                          disabled={pending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="finance" className="mt-4">
            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Finanse i umowa</CardTitle>
                <CardDescription>Stawki i powierzchnie (wartość szacunkowa netto).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="financial_details.usableAreaM2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Powierzchnia użytkowa (m²)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(parseOptionalNumber(e.target.value))}
                            disabled={pending}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="financial_details.garageAreaM2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Powierzchnia garażu (m²)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(parseOptionalNumber(e.target.value))}
                            disabled={pending}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="financial_details.rateUsablePerM2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Wynagrodzenie za m² (pow. użytkowa)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(parseOptionalNumber(e.target.value))}
                            disabled={pending}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="financial_details.rateGaragePerM2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Wynagrodzenie za m² (garaż)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(parseOptionalNumber(e.target.value))}
                            disabled={pending}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="financial_details.contractAmendmentDate"
                  render={({ field }) => (
                    <FormItem className="max-w-xs">
                      <FormLabel>Data umowy / aneksu</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                          disabled={pending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="rounded-lg border border-border/80 bg-muted/15 p-4 text-right">
                  <p className="text-xs text-muted-foreground">Wartość kontraktu netto (szac.)</p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">{netFormatted}</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="formal" className="mt-4">
            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Dane formalne i kontakt zarządu</CardTitle>
                <CardDescription>NIP, REGON oraz główny e-mail zarządu.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="board_email"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>E-mail zarządu</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          inputMode="email"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                          disabled={pending}
                        />
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
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                          disabled={pending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="regon"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>REGON</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                          disabled={pending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="board" className="mt-4">
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">Zarząd wspólnoty</CardTitle>
                  <CardDescription>Osoby kontaktowe — możesz dodać wiele wpisów.</CardDescription>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  disabled={pending}
                  onClick={() =>
                    append({
                      id: crypto.randomUUID(),
                      fullName: "",
                      email: "",
                      phone: "",
                    })
                  }
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Dodaj osobę
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {fields.length === 0 ? (
                  <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    Brak osób — użyj „Dodaj osobę”.
                  </p>
                ) : (
                  fields.map((f, idx) => (
                    <div key={f.id}>
                      {idx > 0 ? <Separator className="mb-4" /> : null}
                      <div className="grid gap-3 md:grid-cols-12 md:items-end">
                        <FormField
                          control={form.control}
                          name={`board_members.${idx}.fullName`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-3">
                              <FormLabel>Imię i nazwisko</FormLabel>
                              <FormControl>
                                <Input {...field} disabled={pending} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`board_members.${idx}.email`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-4">
                              <FormLabel>E-mail</FormLabel>
                              <FormControl>
                                <Input
                                  type="email"
                                  inputMode="email"
                                  {...field}
                                  value={field.value ?? ""}
                                  disabled={pending}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`board_members.${idx}.phone`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-4">
                              <FormLabel>Telefon</FormLabel>
                              <div className="flex gap-2">
                                <FormControl>
                                  <Input {...field} disabled={pending} className="min-w-0 flex-1" />
                                </FormControl>
                                {field.value.trim() ? (
                                  <Button type="button" variant="outline" size="icon" className="shrink-0" asChild>
                                    <a href={telHref(field.value)} aria-label="Zadzwoń">
                                      <Headphones className="h-4 w-4" />
                                    </a>
                                  </Button>
                                ) : (
                                  <Button type="button" variant="outline" size="icon" className="shrink-0" disabled>
                                    <Headphones className="h-4 w-4 opacity-40" />
                                  </Button>
                                )}
                              </div>
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
                            aria-label="Usuń osobę"
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
          </TabsContent>

          <TabsContent value="codes" className="mt-4">
            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Kody dostępu</CardTitle>
                <CardDescription>Domofon, szyfrator i brama — współdzielone dla budynków pod wspólnotą.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="access_codes.intercom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kod do domofonu</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="off" disabled={pending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="access_codes.keypad"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kod do szyfratora</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="off" disabled={pending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="access_codes.gate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kod do bramy</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="off" disabled={pending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes" className="mt-4">
            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Uwagi operacyjne</CardTitle>
                <CardDescription>Administracja, sprzątanie i serwis.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <FormField
                  control={form.control}
                  name="operational_notes.administration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Uwagi dla administracji</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} disabled={pending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="operational_notes.cleaning"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Uwagi dla ekipy sprzątającej</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} disabled={pending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="operational_notes.serwis"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Uwagi dla techników (serwis)</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} disabled={pending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end">
          <Button type="submit" disabled={pending || !form.formState.isDirty} className="min-w-[160px] gap-2">
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Zapisywanie…
              </>
            ) : (
              "Zapisz zmiany wspólnoty"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
