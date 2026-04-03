import { z } from "zod";

import type { PropertyContract, PropertyContractType } from "@/types/contracts";

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

export const VAT_RATE_OPTIONS = [
  { selectValue: "23", label: "23%", rate: 23 },
  { selectValue: "8", label: "8%", rate: 8 },
  { selectValue: "0", label: "0%", rate: 0 },
  { selectValue: "zw", label: "ZW", rate: 0 },
] as const;

export const addContractFormSchema = z
  .object({
    company_id: z.string().min(1, "Wybierz firmę").uuid("Wybierz firmę"),
    type: z.enum(PROPERTY_CONTRACT_TYPES),
    contract_number: z.string().trim().min(1, "Podaj numer umowy"),
    start_date: z.string().min(1, "Podaj datę rozpoczęcia"),
    end_date: z.string().optional(),
    net_value: z.coerce.number().min(0, "Kwota netto musi być liczbą nieujemną"),
    vat_rate: z.coerce
      .number()
      .refine((v) => v === 0 || v === 8 || v === 23, "Wybierz stawkę VAT"),
    gross_value: z.coerce.number().min(0, "Kwota brutto musi być liczbą nieujemną"),
    custom_type_name: z.string().optional(),
    notice_period_months: z.preprocess((val) => {
      if (val === "" || val === null || val === undefined) return undefined;
      const n = typeof val === "number" ? val : Number(val);
      return Number.isFinite(n) ? n : undefined;
    }, z.number().min(0, "Okres wypowiedzenia nie może być ujemny").optional()),
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
  )
  .refine(
    (data) => {
      if (data.type !== "other") return true;
      return (data.custom_type_name?.trim().length ?? 0) >= 3;
    },
    {
      message: "Podaj nazwę typu umowy (min. 3 znaki)",
      path: ["custom_type_name"],
    },
  );

export type AddContractFormValues = z.infer<typeof addContractFormSchema>;

function normalizeVatRate(raw: number | null | undefined): 0 | 8 | 23 {
  if (raw === 0 || raw === 8 || raw === 23) return raw;
  return 23;
}

export function propertyContractToFormValues(contract: PropertyContract): AddContractFormValues {
  const vat = normalizeVatRate(contract.vat_rate);
  const net = contract.net_value;
  const gross = Math.round(net * (1 + vat / 100) * 100) / 100;

  return {
    company_id: contract.company_id,
    type: contract.type,
    contract_number: contract.contract_number,
    start_date: contract.start_date.slice(0, 10),
    end_date: contract.end_date ? contract.end_date.slice(0, 10) : "",
    net_value: net,
    vat_rate: vat,
    gross_value: gross,
    custom_type_name: contract.custom_type_name ?? "",
    notice_period_months: contract.notice_period_months ?? undefined,
  };
}
