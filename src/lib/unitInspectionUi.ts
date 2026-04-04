import type { Database } from "@/types/supabase";

export type UnitInspectionStatus = Database["public"]["Enums"]["unit_inspection_status"];

const STATUS_LABELS: Record<UnitInspectionStatus, string> = {
  pending: "Oczekuje",
  completed: "Zrobione",
  failed_no_access: "Awizo",
  failed_defects: "Usterki",
  rescheduled: "Przełożone",
};

export function unitInspectionStatusLabel(status: UnitInspectionStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/** Tailwind classes for Badge (variant outline + custom bg). */
export function unitInspectionStatusBadgeClass(status: UnitInspectionStatus): string {
  switch (status) {
    case "pending":
      return "border-transparent bg-muted text-muted-foreground";
    case "completed":
      return "border-transparent bg-emerald-600 text-white hover:bg-emerald-600/90";
    case "failed_no_access":
      return "border-transparent bg-orange-500 text-white hover:bg-orange-500/90";
    case "failed_defects":
      return "border-transparent bg-destructive text-destructive-foreground";
    case "rescheduled":
      return "border-transparent bg-amber-500 text-white hover:bg-amber-500/90";
    default:
      return "border-transparent bg-secondary text-secondary-foreground";
  }
}
