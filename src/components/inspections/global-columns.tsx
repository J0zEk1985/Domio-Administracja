import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTableColumnHeader } from "@/components/contracts/DataTableColumnHeader";
import { Badge } from "@/components/ui/badge";
import {
  INSPECTION_STATUS_LABELS,
  INSPECTION_TYPE_LABELS,
  INSPECTION_TYPES,
  type InspectionType,
} from "@/schemas/inspectionSchema";
import type { Enums } from "@/types/supabase";
import type { PropertyInspectionGlobalRow } from "@/hooks/useAllInspections";
import { cn } from "@/lib/utils";

type SyncStatus = Enums<"sync_status">;

const navLinkClass = "font-medium text-primary transition-colors hover:underline";

function executionDateMs(iso: string): number {
  const s = iso.slice(0, 10);
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!y || !m || !d) {
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : 0;
  }
  return new Date(y, m - 1, d).getTime();
}

function validUntilMs(iso: string): number {
  return executionDateMs(iso);
}

function daysFromTodayToValidUntil(validUntil: string): number | null {
  const s = validUntil.slice(0, 10);
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  const end = new Date(y, m - 1, d);
  end.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

function formatIsoDateLabel(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") {
    return "—";
  }
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!y || !m || !d) return s;
  return new Date(y, m - 1, d).toLocaleDateString("pl-PL");
}

/** Distinct badge treatment per enum value — Stripe-like pastel chips. */
const INSPECTION_TYPE_BADGE_CLASS: Record<InspectionType, string> = {
  building: "border-stone-500/35 bg-stone-500/10 text-stone-900 dark:text-stone-100",
  building_5yr: "border-stone-600/35 bg-stone-600/10 text-stone-950 dark:text-stone-100",
  chimney: "border-orange-500/35 bg-orange-500/10 text-orange-950 dark:text-orange-100",
  gas: "border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100",
  electrical: "border-yellow-500/40 bg-yellow-500/10 text-yellow-950 dark:text-yellow-100",
  fire_safety: "border-red-500/35 bg-red-500/10 text-red-950 dark:text-red-100",
  elevator_udt: "border-slate-500/35 bg-slate-500/12 text-slate-900 dark:text-slate-100",
  elevator_electrical: "border-zinc-500/35 bg-zinc-500/12 text-zinc-900 dark:text-zinc-100",
  separator: "border-cyan-500/35 bg-cyan-500/10 text-cyan-950 dark:text-cyan-100",
  hydrophore: "border-sky-500/35 bg-sky-500/10 text-sky-950 dark:text-sky-100",
  rainwater_pump: "border-blue-500/35 bg-blue-500/10 text-blue-950 dark:text-blue-100",
  sewage_pump: "border-indigo-500/35 bg-indigo-500/10 text-indigo-950 dark:text-indigo-100",
  mechanical_ventilation: "border-teal-500/35 bg-teal-500/10 text-teal-950 dark:text-teal-100",
  car_platform: "border-neutral-500/35 bg-neutral-500/10 text-neutral-900 dark:text-neutral-100",
  treatment_plant: "border-emerald-500/35 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100",
  garage_door: "border-gray-500/35 bg-gray-500/10 text-gray-900 dark:text-gray-100",
  entrance_gate: "border-gray-600/35 bg-gray-600/10 text-gray-950 dark:text-gray-100",
  barrier: "border-slate-600/35 bg-slate-600/10 text-slate-950 dark:text-slate-100",
  co_lpg_detectors: "border-rose-500/35 bg-rose-500/10 text-rose-950 dark:text-rose-100",
  other: "border-violet-500/35 bg-violet-500/10 text-violet-950 dark:text-violet-100",
};

function inspectionTypeBadgeClass(type: InspectionType): string {
  return INSPECTION_TYPE_BADGE_CLASS[type] ?? INSPECTION_TYPE_BADGE_CLASS.other;
}

function CkobDot({ status }: { status: SyncStatus }) {
  switch (status) {
    case "synced":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="c-KOB: zsynchronizowano">
          <span className="size-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
          <span className="sr-only">Zsynchronizowano z c-KOB</span>
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="c-KOB: oczekuje">
          <span className="size-2 shrink-0 rounded-full bg-amber-400" aria-hidden />
          <span className="sr-only">Synchronizacja c-KOB w toku</span>
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="c-KOB: błąd">
          <span className="size-2 shrink-0 rounded-full bg-destructive" aria-hidden />
          <span className="sr-only">Błąd synchronizacji c-KOB</span>
        </span>
      );
    case "not_synced":
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="c-KOB: własny wpis">
          <span className="size-2 shrink-0 rounded-full bg-muted-foreground/35" aria-hidden />
          <span className="sr-only">Bez synchronizacji c-KOB</span>
        </span>
      );
  }
}

export const globalInspectionsColumns: ColumnDef<PropertyInspectionGlobalRow>[] = [
  {
    id: "location",
    accessorFn: (row) => row.location?.name?.trim() || "",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Nieruchomość" />,
    cell: ({ row }) => {
      const loc = row.original.location;
      const name = loc?.name?.trim() || "—";
      const id = row.original.location_id;
      if (name !== "—") {
        return (
          <Link to={`/properties/${id}`} className={navLinkClass}>
            {name}
          </Link>
        );
      }
      return <span className="text-muted-foreground">—</span>;
    },
    enableSorting: true,
  },
  {
    id: "inspectionType",
    accessorFn: (row) => row.type,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Typ przeglądu" />,
    cell: ({ row }) => {
      const t = row.original.type;
      const label = INSPECTION_TYPE_LABELS[t] ?? t;
      return (
        <Badge variant="outline" className={cn("max-w-[220px] whitespace-normal font-normal leading-snug", inspectionTypeBadgeClass(t))}>
          {label}
        </Badge>
      );
    },
    enableSorting: true,
    sortingFn: (a, b) =>
      INSPECTION_TYPES.indexOf(a.original.type) - INSPECTION_TYPES.indexOf(b.original.type),
  },
  {
    id: "company",
    accessorFn: (row) => row.company?.name?.trim() || "",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Firma" />,
    cell: ({ row }) => {
      const name = row.original.company?.name?.trim() ?? "";
      const id = row.original.company_id;
      if (name.length > 0) {
        return (
          <Link to={`/companies/${id}`} className={navLinkClass}>
            {name}
          </Link>
        );
      }
      return <span className="text-muted-foreground">—</span>;
    },
    enableSorting: true,
  },
  {
    id: "validUntil",
    accessorFn: (row) => validUntilMs(row.valid_until),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Ważne do" />,
    cell: ({ row }) => {
      const raw = row.original.valid_until;
      const label = formatIsoDateLabel(raw);
      const delta = daysFromTodayToValidUntil(raw);

      if (delta === null) {
        return <span className="tabular-nums text-muted-foreground">{label}</span>;
      }
      if (delta < 0) {
        return (
          <span className="inline-flex items-center gap-1.5 tabular-nums font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {label}
          </span>
        );
      }
      if (delta <= 30) {
        return (
          <span className="tabular-nums font-medium text-orange-600 dark:text-orange-400">{label}</span>
        );
      }
      return <span className="tabular-nums text-foreground">{label}</span>;
    },
    enableSorting: true,
  },
  {
    id: "protocolStatus",
    accessorFn: (row) => row.status,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Wynik" />,
    cell: ({ row }) => {
      const s = row.original.status;
      const label = INSPECTION_STATUS_LABELS[s] ?? s;
      return (
        <span
          className={cn(
            "text-sm text-muted-foreground",
            s === "negative" && "font-medium text-destructive",
          )}
        >
          {label}
        </span>
      );
    },
    enableSorting: true,
  },
  {
    id: "ckob",
    accessorFn: (row) => row.c_kob_sync_status,
    header: () => <span className="text-sm font-medium text-muted-foreground">c-KOB</span>,
    cell: ({ row }) => <CkobDot status={row.original.c_kob_sync_status} />,
    enableSorting: false,
  },
];
