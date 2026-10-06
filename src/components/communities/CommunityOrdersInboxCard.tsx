import { useEffect, useMemo, useState } from "react";

import { CompanyComboBox } from "@/components/companies/CompanyComboBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCommunityResidentOrders, useResidentOrderActions, useResidentOrderEvents } from "@/hooks/useResidentOrders";
import {
  formatResidentOrderPrice,
  RESIDENT_ORDER_EVENT_LABEL,
  RESIDENT_ORDER_STATUS_LABEL,
  type ResidentOrder,
  type ResidentOrderStatus,
} from "@/types/residentOrders";

const OPEN_STATUSES: ResidentOrderStatus[] = [
  "pending",
  "stock_delivery",
  "dispatch_queued",
  "dispatch_sent",
  "dispatch_failed",
  "contractor_ready",
  "contractor_rejected",
];
const HISTORY_LIMIT = 8;

function statusVariant(status: ResidentOrderStatus): "default" | "secondary" | "outline" | "destructive" {
  if (status === "pending" || status === "stock_delivery") return "default";
  if (status === "dispatch_failed" || status === "contractor_rejected") return "destructive";
  if (
    status === "delivered" ||
    status === "dispatch_sent" ||
    status === "ordered_offline" ||
    status === "contractor_ready"
  ) {
    return "secondary";
  }
  return "outline";
}

function OrderMeta({ order }: { order: ResidentOrder }) {
  const price = formatResidentOrderPrice(order.itemPriceAmount, order.itemPriceKind);
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-medium leading-snug">{order.itemName}</p>
      {order.publicNumber ? (
        <p className="text-xs font-medium text-foreground/80">{order.publicNumber}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {order.locationAddress || order.locationName || "Budynek"}
        {order.unitNumber ? ` · lokal ${order.unitNumber}` : ""}
        {` · ${order.quantity} szt.`}
        {price ? ` · ${price}` : ""}
      </p>
      <p className="text-xs text-muted-foreground">
        {order.residentFullName || "Mieszkaniec"}
        {order.contactPhone ? ` · tel. ${order.contactPhone}` : ""}
        {order.notes ? ` · uwagi: ${order.notes}` : ""}
      </p>
    </div>
  );
}

function OrderEvents({ orderId }: { orderId: string }) {
  const eventsQuery = useResidentOrderEvents(orderId);
  const events = eventsQuery.data ?? [];
  if (eventsQuery.isLoading) return <p className="text-xs text-muted-foreground">Historia…</p>;
  if (events.length === 0) return null;
  return (
    <ul className="space-y-1 text-xs text-muted-foreground">
      {events.slice(0, 6).map((ev) => (
        <li key={ev.id}>
          {new Date(ev.createdAt).toLocaleString("pl-PL")} — {RESIDENT_ORDER_EVENT_LABEL[ev.eventType]}
        </li>
      ))}
    </ul>
  );
}

function OpenOrderRow({ order }: { order: ResidentOrder }) {
  const { stock, offline, company, dispatch } = useResidentOrderActions(order.communityId);
  const [companyId, setCompanyId] = useState(order.fulfillmentCompanyId ?? "");

  useEffect(() => {
    setCompanyId(order.fulfillmentCompanyId ?? "");
  }, [order.fulfillmentCompanyId]);
  const [showEvents, setShowEvents] = useState(false);
  const canStock =
    order.status === "pending" ||
    order.status === "dispatch_failed" ||
    order.status === "contractor_ready" ||
    order.status === "contractor_rejected";
  const canOffline =
    order.status === "pending" ||
    order.status === "dispatch_failed" ||
    order.status === "contractor_rejected";
  const canDispatch = canOffline;
  const busy = stock.isPending || offline.isPending || dispatch.isPending || company.isPending;

  return (
    <li className="space-y-3 rounded-md border border-border/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <OrderMeta order={order} />
        <Badge variant={statusVariant(order.status)}>{RESIDENT_ORDER_STATUS_LABEL[order.status]}</Badge>
      </div>
      {order.dispatchError ? <p className="text-xs text-destructive">{order.dispatchError}</p> : null}
      <div className="space-y-1.5">
        <p className="text-xs font-medium">Podmiot (można zmienić)</p>
        <CompanyComboBox value={companyId} onChange={setCompanyId} disabled={busy} />
        {companyId && companyId !== (order.fulfillmentCompanyId ?? "") ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !companyId}
            onClick={() => company.mutate({ orderId: order.id, companyId })}
          >
            Zapisz podmiot
          </Button>
        ) : null}
      </div>
      {order.status === "dispatch_sent" ? (
        <p className="text-xs text-muted-foreground">
          Czekamy na odpowiedź firmy. W mailu musi być numer {order.publicNumber || "zamówienia"}.
        </p>
      ) : null}
      {canStock || canOffline ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy || !canStock} onClick={() => stock.mutate(order.id)}>
            Mam na stanie — przekażę
          </Button>
          {canOffline ? (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => offline.mutate(order.id)}>
              Zamówione poza systemem
            </Button>
          ) : null}
          {canDispatch ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => dispatch.mutate({ orderId: order.id, companyId: companyId || null })}
            >
              Wyślij do kontrahenta
            </Button>
          ) : null}
        </div>
      ) : null}
      <Button type="button" variant="ghost" size="sm" className="h-8 px-0" onClick={() => setShowEvents((v) => !v)}>
        {showEvents ? "Ukryj historię" : "Pokaż historię"}
      </Button>
      {showEvents ? <OrderEvents orderId={order.id} /> : null}
    </li>
  );
}

type Props = {
  communityId: string;
};

export function CommunityOrdersInboxCard({ communityId }: Props) {
  const ordersQuery = useCommunityResidentOrders(communityId);
  const orders = ordersQuery.data ?? [];

  const { open, history } = useMemo(() => {
    const openRows = orders.filter((row) => OPEN_STATUSES.includes(row.status));
    const historyRows = orders.filter((row) => !OPEN_STATUSES.includes(row.status)).slice(0, HISTORY_LIMIT);
    return { open: openRows, history: historyRows };
  }, [orders]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Zamówienia z Home</CardTitle>
        <CardDescription>
          Nowe zlecenia od mieszkańców. Historia pokazuje kilka ostatnich zamkniętych zamówień.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {ordersQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Wczytywanie zamówień…</p>
        ) : ordersQuery.isError ? (
          <p className="text-sm text-destructive">Nie udało się wczytać zamówień.</p>
        ) : (
          <>
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Do realizacji</h3>
              {open.length === 0 ? (
                <p className="text-sm text-muted-foreground">Brak otwartych zamówień.</p>
              ) : (
                <ul className="space-y-3">
                  {open.map((order) => (
                    <OpenOrderRow key={order.id} order={order} />
                  ))}
                </ul>
              )}
            </section>
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Ostatnie zamówienia</h3>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Brak zakończonych zamówień.</p>
              ) : (
                <ul className="space-y-2">
                  {history.map((order) => (
                    <li key={order.id} className="flex items-start justify-between gap-3 rounded-md border border-border/40 p-3">
                      <OrderMeta order={order} />
                      <Badge variant={statusVariant(order.status)}>{RESIDENT_ORDER_STATUS_LABEL[order.status]}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
