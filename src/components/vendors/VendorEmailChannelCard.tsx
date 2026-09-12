import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSaveVendorEmailChannel, useVendorEmailChannel } from "@/hooks/useVendorEmail";
import { emptyVendorEmailChannel, splitCsv } from "@/lib/vendorEmailApi";
import { VENDOR_EMAIL_OUTBOUND_PLACEHOLDERS } from "@/types/vendorEmail";

type Props = {
  vendorId: string;
  vendorName: string;
  contactEmail: string | null;
};

export function VendorEmailChannelCard({ vendorId, vendorName, contactEmail }: Props) {
  const channelQuery = useVendorEmailChannel(vendorId);
  const save = useSaveVendorEmailChannel(vendorId);
  const channel = channelQuery.data ?? emptyVendorEmailChannel(vendorId, "");

  const [enabled, setEnabled] = useState(false);
  const [toEmail, setToEmail] = useState("");
  const [cc, setCc] = useState("");
  const [allowlist, setAllowlist] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    setEnabled(channel.isEnabled);
    setToEmail(channel.outboundToEmail ?? contactEmail ?? "");
    setCc(channel.outboundCc.join(", "));
    setAllowlist(channel.inboundFromAllowlist.join(", "));
    setSubject(channel.outboundSubjectTemplate);
    setBody(channel.outboundBodyTemplate);
  }, [channel, contactEmail, vendorId]);

  const canSave = useMemo(() => {
    if (subject.trim().length === 0 || body.trim().length === 0) return false;
    if (enabled && (toEmail.trim().length < 3 || !toEmail.includes("@"))) return false;
    return true;
  }, [body, enabled, subject, toEmail]);

  if (channelQuery.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kanał wychodzący</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Wczytywanie ustawień…</p>
        </CardContent>
      </Card>
    );
  }

  if (channelQuery.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kanał wychodzący</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Nie udało się wczytać kanału e-mail.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Wysyłka do {vendorName}</CardTitle>
        <CardDescription>
          Gdy most jest włączony, delegacja zgłoszenia wysyła e-mail zamiast oczekiwania na konto w DOMIO.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-muted/10 px-4 py-3">
          <div className="space-y-1 pr-2">
            <Label htmlFor="vendor-email-enabled" className="text-sm font-medium">
              Most e-mail włączony
            </Label>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Partner bez logowania. Statusy wracają z ich systemu pocztą.
            </p>
          </div>
          <Switch
            id="vendor-email-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vendor-email-to">Adres odbiorcy</Label>
          <Input
            id="vendor-email-to"
            type="email"
            value={toEmail}
            onChange={(ev) => setToEmail(ev.target.value)}
            placeholder="zgloszenia@firma.pl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vendor-email-cc">DW (opcjonalnie, po przecinku)</Label>
          <Input
            id="vendor-email-cc"
            value={cc}
            onChange={(ev) => setCc(ev.target.value)}
            placeholder="biuro@firma.pl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vendor-email-allow">Nadawcy statusów (e-mail lub @domena)</Label>
          <Input
            id="vendor-email-allow"
            value={allowlist}
            onChange={(ev) => setAllowlist(ev.target.value)}
            placeholder="noreply@firma.pl, @crm.firma.pl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vendor-email-subject">Temat wiadomości</Label>
          <Input
            id="vendor-email-subject"
            value={subject}
            onChange={(ev) => setSubject(ev.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vendor-email-body">Treść (placeholdery {"{{...}}"})</Label>
          <Textarea
            id="vendor-email-body"
            value={body}
            onChange={(ev) => setBody(ev.target.value)}
            rows={12}
            className="font-mono text-xs"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Dostępne pola: {VENDOR_EMAIL_OUTBOUND_PLACEHOLDERS.join(", ")}
        </p>
        <Button
          type="button"
          disabled={save.isPending || !canSave}
          onClick={() =>
            save.mutate({
              vendorId,
              outboundToEmail: toEmail,
              outboundCc: splitCsv(cc),
              outboundSubjectTemplate: subject,
              outboundBodyTemplate: body,
              inboundFromAllowlist: splitCsv(allowlist),
              isEnabled: enabled,
            })
          }
        >
          {save.isPending ? "Zapisywanie…" : "Zapisz kanał"}
        </Button>
      </CardContent>
    </Card>
  );
}
