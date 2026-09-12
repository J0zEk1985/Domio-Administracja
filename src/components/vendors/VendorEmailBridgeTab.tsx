import { useMemo, useState } from "react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

import { VendorEmailChannelCard } from "@/components/vendors/VendorEmailChannelCard";
import { VendorEmailInboundTemplatesCard } from "@/components/vendors/VendorEmailInboundTemplatesCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAssignUnmatchedVendorEmail, useUnmatchedVendorEmails } from "@/hooks/useVendorEmail";
import { useVendorPartners, type VendorPartnerRow } from "@/hooks/useVendorPartners";
import {
  VENDOR_DISPATCH_CHANNEL_LABEL,
  VENDOR_EMAIL_EVENT_LABEL,
  VENDOR_EMAIL_INBOUND_STATUS_LABEL,
  type VendorEmailEventType,
  type VendorEmailInboundEvent,
} from "@/types/vendorEmail";
import { cn } from "@/lib/utils";

function formatDt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "d MMM yyyy, HH:mm", { locale: pl });
}

export function VendorEmailBridgeTab() {
  const partnersQuery = useVendorPartners(true);
  const unmatchedQuery = useUnmatchedVendorEmails(true);
  const partners = partnersQuery.data ?? [];
  const [selectedId, setSelectedId] = useState<string>("");

  const selected: VendorPartnerRow | undefined = useMemo(
    () => partners.find((p) => p.id === selectedId) ?? partners[0],
    [partners, selectedId],
  );

  const activeId = selected?.id ?? "";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Partnerzy B2B</CardTitle>
          <CardDescription>
            Wybierz firmę bez konta w DOMIO i skonfiguruj most e-mail. Delegacja zgłoszenia wyśle wtedy
            szablon, a statusy wrócą z ich CRM.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {partnersQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Wczytywanie partnerów…</p>
          ) : partnersQuery.isError ? (
            <p className="text-sm text-destructive">Nie udało się wczytać listy partnerów.</p>
          ) : partners.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Brak partnerów B2B. Dodaj firmę w module umów, a następnie włącz most e-mail.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {partners.map((p) => {
                const channel = p.dispatch_channel === "email" ? "email" : "in_app";
                const active = p.id === activeId;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                        active ? "bg-muted/60" : "hover:bg-muted/30",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{p.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.service_type}
                          {p.contact_email ? ` · ${p.contact_email}` : ""}
                        </span>
                      </span>
                      <Badge variant={channel === "email" ? "default" : "outline"} className="shrink-0 font-normal">
                        {VENDOR_DISPATCH_CHANNEL_LABEL[channel]}
                      </Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {activeId && selected ? (
        <>
          <VendorEmailChannelCard
            vendorId={activeId}
            vendorName={selected.name}
            contactEmail={selected.contact_email ?? null}
          />
          <VendorEmailInboundTemplatesCard vendorId={activeId} />
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Niedopasowane wiadomości</CardTitle>
          <CardDescription>
            Maile statusowe bez automatycznego powiązania. Przypisz numer DOMIO z naszej wysyłki i status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {unmatchedQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Wczytywanie…</p>
          ) : unmatchedQuery.isError ? (
            <p className="text-sm text-destructive">Nie udało się wczytać wiadomości.</p>
          ) : (unmatchedQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak niedopasowanych wiadomości.</p>
          ) : (
            <ul className="space-y-3">
              {(unmatchedQuery.data ?? []).map((ev) => (
                <UnmatchedEmailRow key={ev.id} event={ev} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UnmatchedEmailRow({ event }: { event: VendorEmailInboundEvent }) {
  const assign = useAssignUnmatchedVendorEmail();
  const [issueRef, setIssueRef] = useState("");
  const [eventType, setEventType] = useState<VendorEmailEventType>("accepted");
  const [vendorRef, setVendorRef] = useState("");

  return (
    <li className="rounded-lg border border-border/60 p-3 text-sm space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-normal">
          {VENDOR_EMAIL_INBOUND_STATUS_LABEL[event.status]}
        </Badge>
        <span className="text-xs text-muted-foreground">{formatDt(event.createdAt)}</span>
      </div>
      <p className="font-medium">{event.subject?.trim() || "(brak tematu)"}</p>
      <p className="text-xs text-muted-foreground">
        Od: {event.fromAddress ?? "—"}
        {event.errorDetail ? ` · ${event.errorDetail}` : ""}
      </p>
      <form
        className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void assign.mutateAsync({
            eventId: event.id,
            issueId: issueRef,
            eventType,
            vendorExternalRef: vendorRef,
          });
        }}
      >
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor={`domio-${event.id}`}>
            Numer DOMIO
          </label>
          <Input
            id={`domio-${event.id}`}
            value={issueRef}
            onChange={(e) => setIssueRef(e.target.value)}
            placeholder="np. a1b2c3d4e5f6"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={eventType} onValueChange={(v) => setEventType(v as VendorEmailEventType)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(VENDOR_EMAIL_EVENT_LABEL) as VendorEmailEventType[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {VENDOR_EMAIL_EVENT_LABEL[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={assign.isPending || !issueRef.trim()}>
          Przypisz
        </Button>
        <div className="sm:col-span-3 space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor={`wo-${event.id}`}>
            Numer zlecenia firmy (opcjonalnie)
          </label>
          <Input
            id={`wo-${event.id}`}
            value={vendorRef}
            onChange={(e) => setVendorRef(e.target.value)}
            placeholder="Jeśli firma podała swój numer"
          />
        </div>
      </form>
    </li>
  );
}
