import { useMemo, useState } from "react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

import { VendorEmailChannelCard } from "@/components/vendors/VendorEmailChannelCard";
import { VendorEmailInboundTemplatesCard } from "@/components/vendors/VendorEmailInboundTemplatesCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useUnmatchedVendorEmails } from "@/hooks/useVendorEmail";
import { useVendorPartners, type VendorPartnerRow } from "@/hooks/useVendorPartners";
import {
  VENDOR_DISPATCH_CHANNEL_LABEL,
  VENDOR_EMAIL_INBOUND_STATUS_LABEL,
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
            Maile statusowe, których nie udało się powiązać ze zgłoszeniem. Sprawdź wzorzec albo allowlistę
            nadawcy.
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
                <li key={ev.id} className="rounded-lg border border-border/60 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-normal">
                      {VENDOR_EMAIL_INBOUND_STATUS_LABEL[ev.status]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatDt(ev.createdAt)}</span>
                  </div>
                  <p className="mt-1 font-medium">{ev.subject?.trim() || "(brak tematu)"}</p>
                  <p className="text-xs text-muted-foreground">
                    Od: {ev.fromAddress ?? "—"}
                    {ev.errorDetail ? ` · ${ev.errorDetail}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
