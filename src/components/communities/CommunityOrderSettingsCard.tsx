import { useEffect, useRef, useState } from "react";

import { OrderEmailTokenList } from "@/components/communities/OrderEmailTokenList";
import { CompanyComboBox } from "@/components/companies/CompanyComboBox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useResidentOrderSettings, useSaveResidentOrderSettings } from "@/hooks/useResidentOrders";
import {
  RESIDENT_ORDER_SIMPLE_BODY,
  RESIDENT_ORDER_SIMPLE_SUBJECT,
  insertResidentOrderToken,
  isFactoryResidentOrderTemplate,
  residentOrderTemplateToFriendly,
  residentOrderTemplateToTechnical,
} from "@/lib/residentOrderTemplateTokens";

type Props = {
  communityId: string;
};

type ActiveField = "subject" | "body";

export function CommunityOrderSettingsCard({ communityId }: Props) {
  const settingsQuery = useResidentOrderSettings(communityId);
  const save = useSaveResidentOrderSettings(communityId);
  const settings = settingsQuery.data ?? null;

  const [companyId, setCompanyId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [activeField, setActiveField] = useState<ActiveField>("body");
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const hasSettings = settings != null;
  const savedCompanyId = settings?.defaultCompanyId ?? "";
  const savedSubject = settings?.emailSubjectTemplate ?? "";
  const savedBody = settings?.emailBodyTemplate ?? "";

  useEffect(() => {
    if (!hasSettings) return;
    setCompanyId(savedCompanyId);
    setSubject(residentOrderTemplateToFriendly(savedSubject));
    setBody(residentOrderTemplateToFriendly(savedBody));
  }, [hasSettings, savedCompanyId, savedSubject, savedBody]);

  const technicalSubject = residentOrderTemplateToTechnical(subject);
  const technicalBody = residentOrderTemplateToTechnical(body);
  const usingFactoryTemplate = isFactoryResidentOrderTemplate(technicalSubject, technicalBody);

  function insertToken(friendly: string) {
    const field = activeField;
    const current = field === "subject" ? subject : body;
    const element = field === "subject" ? subjectRef.current : bodyRef.current;
    const start = element?.selectionStart ?? current.length;
    const end = element?.selectionEnd ?? current.length;
    const next = insertResidentOrderToken(current, friendly, start, end);
    if (field === "subject") setSubject(next.value);
    else setBody(next.value);
    requestAnimationFrame(() => {
      const node = field === "subject" ? subjectRef.current : bodyRef.current;
      node?.focus();
      node?.setSelectionRange(next.cursor, next.cursor);
    });
  }

  function applySimpleTemplate() {
    const alreadySimple = subject === RESIDENT_ORDER_SIMPLE_SUBJECT && body === RESIDENT_ORDER_SIMPLE_BODY;
    if (!usingFactoryTemplate && !alreadySimple) {
      const confirmed = window.confirm("Zastąpić obecną treść prostym szablonem?");
      if (!confirmed) return;
    }
    setSubject(RESIDENT_ORDER_SIMPLE_SUBJECT);
    setBody(RESIDENT_ORDER_SIMPLE_BODY);
  }

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
          Wybierz firmę, która dostanie e-mail z zamówieniem. W temacie i treści wstaw pola z listy — przy wysyłce
          pojawią się w nich prawdziwe dane.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Firma realizująca zamówienie</Label>
          <CompanyComboBox value={companyId} onChange={setCompanyId} />
          {companyId ? (
            <Button type="button" variant="ghost" size="sm" className="h-8 px-0" onClick={() => setCompanyId("")}>
              Wyczyść wybór
            </Button>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="order-subject">Temat wiadomości</Label>
          <Input
            id="order-subject"
            ref={subjectRef}
            value={subject}
            onChange={(ev) => setSubject(ev.target.value)}
            onFocus={() => setActiveField("subject")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="order-body">Treść wiadomości</Label>
          <Textarea
            id="order-body"
            ref={bodyRef}
            value={body}
            onChange={(ev) => setBody(ev.target.value)}
            onFocus={() => setActiveField("body")}
            rows={14}
            className="text-sm leading-relaxed"
          />
        </div>
        <OrderEmailTokenList onInsert={insertToken} />
        {usingFactoryTemplate ? (
          <p className="text-sm text-muted-foreground">
            Ten szablon zawiera dużo dodatkowych danych. Prosta wersja zostawia tylko to, czego firma potrzebuje do
            realizacji.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={applySimpleTemplate}>
            Wstaw prosty szablon
          </Button>
          <Button
            type="button"
            disabled={save.isPending || subject.trim().length === 0 || body.trim().length === 0}
            onClick={() =>
              save.mutate({
                communityId,
                defaultCompanyId: companyId.trim() === "" ? null : companyId,
                emailSubjectTemplate: technicalSubject,
                emailBodyTemplate: technicalBody,
              })
            }
          >
            {save.isPending ? "Zapisywanie…" : "Zapisz ustawienia"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
