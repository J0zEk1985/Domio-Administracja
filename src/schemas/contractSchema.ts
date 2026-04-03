import { z } from "zod";

import type { PropertyContractType } from "@/types/contracts";

export const PROPERTY_CONTRACT_TYPES = [
  "cleaning",
  "maintenance",
  "administration",
  "elevator",
  "other",
] as const satisfies readonly PropertyContractType[];

export const PROPERTY_CONTRACT_TYPE_LABELS: Record<
  (typeof PROPERTY_CONTRACT_TYPES)[number],
  string
> = {
  cleaning: "Sprzątanie",
  maintenance: "Konserwacja",
  administration: "Administracja",
  elevator: "Windy",
  other: "Inne",
};

export const addContractFormSchema = z
  .object({
    company_id: z.string().min(1, "Wybierz firmę").uuid("Wybierz firmę"),
    type: z.enum(PROPERTY_CONTRACT_TYPES),
    contract_number: z.string().trim().min(1, "Podaj numer umowy"),
    start_date: z.string().min(1, "Podaj datę rozpoczęcia"),
    end_date: z.string().optional(),
    net_value: z.coerce.number().min(0, "Kwota netto musi być liczbą nieujemną"),
  })
  .refine(
    (data) => {
      const end = data.end_date?.trim();
      if (!end) return true;
      return end > data.start_date;
    },
    {
      message: "Data zakończenia musi być późniejsza niż data rozpoczęcia",
      path: ["end_date"],
    },
  );

export type AddContractFormValues = z.infer<typeof addContractFormSchema>;
