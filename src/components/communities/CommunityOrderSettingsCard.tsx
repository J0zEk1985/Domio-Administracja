import { useEffect, useState } from "react";

import { CompanyComboBox } from "@/components/companies/CompanyComboBox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useResidentOrderSettings, useSaveResidentOrderSettings } from "@/hooks/useResidentOrders";
import { RESIDENT_ORDER_TEMPLATE_PLACEHOLDERS } from "@/types/residentOrders";

type Props = {
  communityId: string;
};

export function CommunityOrderSettingsCard({ communityId }: Props) {
  const settingsQuery = useResidentOrderSettings(communityId);
  const save = useSaveResidentOrderSettings(communityId);
  const settings = settingsQuery.data ?? null;

  const [companyId, setCompanyId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!settings) return;
    setCompanyId(settings.defaultCompanyId ?? "");
    setSubject(settings.emailSubjectTemplate);
    setBody(settings.emailBodyTemplate);
  }, [settings]);

  if (settingsQuery.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Podmiot i szablon e-mail</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Wczytywanie ustawień…</p>
        </CardContent>
      </Card>
    );
  }

  if (settingsQuery.isError || !settings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Podmiot i szablon e-mail</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Nie udało się wczytać ustawień zamówień.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Podmiot i szablon e-mail</CardTitle>
        <CardDescription>
          Podmiot można zmienić w każdej chwili (z katalogu firm lub nowy wpis). n8n pobiera ten szablon przy każdej
          wysyłce.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Podmiot realizacji</Label>
          <CompanyComboBox value={companyId} onChange={setCompanyId} />
          {companyId ? (
            <Button type="button" variant="ghost" size="sm" className="h-8 px-0" onClick={() => setCompanyId("")}>
              Wyczyść wybór
            </Button>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="order-subject">Temat wiadomości</Label>
          <Input id="order-subject" value={subject} onChange={(ev) => setSubject(ev.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="order-body">Treść (placeholdery {'{{...}}'})</Label>
          <Textarea id="order-body" value={body} onChange={(ev) => setBody(ev.target.value)} rows={14} className="font-mono text-xs" />
        </div>
        <p className="text-xs text-muted-foreground">
          Dostępne pola: {RESIDENT_ORDER_TEMPLATE_PLACEHOLDERS.join(", ")}
        </p>
        <Button
          type="button"
          disabled={save.isPending || subject.trim().length === 0 || body.trim().length === 0}
          onClick={() =>
            save.mutate({
              communityId,
              defaultCompanyId: companyId.trim() === "" ? null : companyId,
              emailSubjectTemplate: subject,
              emailBodyTemplate: body,
            })
          }
        >
          {save.isPending ? "Zapisywanie…" : "Zapisz ustawienia"}
        </Button>
      </CardContent>
    </Card>
  );
}
