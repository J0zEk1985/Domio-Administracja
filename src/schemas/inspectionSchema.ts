import { z } from "zod";

import type { Enums } from "@/types/supabase";

export type InspectionType = Enums<"inspection_type">;
export type InspectionStatus = Enums<"inspection_status">;

/** Aligned with `public.inspection_type` — keep in sync with migrations / `supabase.ts`. */
export const INSPECTION_TYPES = [
  "building",
  "building_5yr",
  "chimney",
  "gas",
  "electrical",
  "fire_safety",
  "elevator_udt",
  "elevator_electrical",
  "separator",
  "hydrophore",
  "rainwater_pump",
  "sewage_pump",
  "mechanical_ventilation",
  "car_platform",
  "treatment_plant",
  "garage_door",
  "entrance_gate",
  "barrier",
  "co_lpg_detectors",
  "other",
] as const satisfies readonly InspectionType[];

/** Aligned with `public.inspection_status`. */
export const INSPECTION_STATUSES = ["positive", "positive_with_defects", "negative"] as const satisfies readonly InspectionStatus[];

export const INSPECTION_TYPE_LABELS: Record<InspectionType, string> = {
  building: "Budowlany (roczny)",
  building_5yr: "Budowlany (5-letni)",
  chimney: "Przewód kominowy",
  gas: "Gazowy",
  electrical: "Elektryczny",
  fire_safety: "Przeciwpożarowy",
  elevator_udt: "Windy — UDT",
  elevator_electrical: "Windy — elektryczny",
  separator: "Separator substancji ropopochodnych",
  hydrophore: "Hydrofornia",
  rainwater_pump: "Pompa deszczówki",
  sewage_pump: "Pompa ściekowa",
  mechanical_ventilation: "Wentylacja mechaniczna",
  car_platform: "Platforma parkingowa",
  treatment_plant: "Oczyszczalnia / przydomowa",
  garage_door: "Brama garażowa",
  entrance_gate: "Brama wjazdowa",
  barrier: "Szlaban",
  co_lpg_detectors: "Czujniki CO / LPG",
  other: "Inny",
};

export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  positive: "Pozytywny",
  positive_with_defects: "Pozytywny z uwagami",
  negative: "Negatywny",
};

const inspectionTypeSchema = z.enum(INSPECTION_TYPES);
const inspectionStatusSchema = z.enum(INSPECTION_STATUSES);

export const addInspectionFormSchema = z
  .object({
    company_id: z.string().min(1, "Wybierz firmę").uuid("Wybierz firmę"),
    type: inspectionTypeSchema,
    status: inspectionStatusSchema.default("positive"),
    execution_date: z.string().min(1, "Podaj datę wykonania"),
    valid_until: z.string().min(1, "Podaj datę ważności"),
    protocol_number: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  })
  .refine((data) => data.valid_until >= data.execution_date, {
    message: "Data ważności nie może być wcześniejsza niż data wykonania",
    path: ["valid_until"],
  });

export type AddInspectionFormValues = z.infer<typeof addInspectionFormSchema>;
