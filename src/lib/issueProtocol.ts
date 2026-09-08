import type { Json } from "@/types/supabase";

export type IssueSurchargeKind = "on_call" | "urgent";

export type PropertyIssueMaterialUsed = {
  name: string;
  quantity: number;
  unit_cost: number;
};

export const SURCHARGE_KIND_LABELS: Record<IssueSurchargeKind, string> = {
  on_call: "Dyżur",
  urgent: "Tryb pilny",
};

export type PropertyIssueProtocolFields = {
  protocol_number: string | null;
  surcharge_kind: IssueSurchargeKind | null;
  surcharge_amount: number | null;
  hourly_rate_applied: number | null;
};

function asFiniteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseSurchargeKind(raw: unknown): IssueSurchargeKind | null {
  if (raw === "on_call" || raw === "urgent") return raw;
  return null;
}

export function parseProtocolFields(row: Record<string, unknown>): PropertyIssueProtocolFields {
  return {
    protocol_number:
      typeof row.protocol_number === "string" && row.protocol_number.trim()
        ? row.protocol_number.trim()
        : null,
    surcharge_kind: parseSurchargeKind(row.surcharge_kind),
    surcharge_amount: asFiniteNumber(row.surcharge_amount),
    hourly_rate_applied: asFiniteNumber(row.hourly_rate_applied),
  };
}

export function parseMaterialsUsed(raw: Json | unknown): PropertyIssueMaterialUsed[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (item == null || typeof item !== "object") return [];
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const quantity = asFiniteNumber(o.quantity);
    const unitCost = asFiniteNumber(o.unit_cost);
    if (!name || quantity == null || unitCost == null) return [];
    return [{ name, quantity, unit_cost: unitCost }];
  });
}

export function materialsUsedTotal(materials: PropertyIssueMaterialUsed[]): number {
  const sum = materials.reduce(
    (acc, item) => acc + (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0),
    0,
  );
  return Math.round(sum * 100) / 100;
}

export function suggestedInvoiceAmount(
  materialCost: number | null | undefined,
  laborCost: number | null | undefined,
  surchargeAmount: number | null | undefined,
): number {
  return Math.round(((materialCost ?? 0) + (laborCost ?? 0) + (surchargeAmount ?? 0)) * 100) / 100;
}
