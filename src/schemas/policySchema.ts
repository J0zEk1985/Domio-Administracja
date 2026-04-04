import { compareAsc, isValid, parseISO } from "date-fns";
import { z } from "zod";

/** Matches DB CHECK `property_policies_policy_scope_check` (ASCII keys). */
export const POLICY_SCOPE_VALUES = ["majatkowe", "oc_ogolne", "oc_zarzadu"] as const;

export type PolicyScope = (typeof POLICY_SCOPE_VALUES)[number];

export const POLICY_SCOPE_LABELS: Record<PolicyScope, string> = {
  majatkowe: "Majątkowe",
  oc_ogolne: "OC",
  oc_zarzadu: "OC Zarządu",
};

const optionalUrl = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim())
  .refine((s) => s === "" || /^https?:\/\/.+/i.test(s), {
    message: "Podaj prawidłowy adres URL (http/https)",
  });

export const insurancePolicyFormSchema = z
  .object({
    policy_number: z.string().trim().min(1, "Podaj numer polisy"),
    company_id: z.string().min(1, "Wybierz ubezpieczyciela").uuid("Wybierz ubezpieczyciela"),
    policy_scope: z.enum(POLICY_SCOPE_VALUES),
    premium_amount: z.coerce.number().min(0, "Składka nie może być ujemna"),
    start_date: z.string().min(1, "Podaj datę początkową"),
    end_date: z.string().min(1, "Podaj datę końcową"),
    document_url: optionalUrl,
  })
  .refine(
    (data) => {
      const start = parseISO(data.start_date);
      const end = parseISO(data.end_date);
      if (!isValid(start) || !isValid(end)) {
        return false;
      }
      return compareAsc(end, start) >= 0;
    },
    {
      message: "Data końcowa nie może być wcześniejsza niż początkowa",
      path: ["end_date"],
    },
  );

export type InsurancePolicyFormValues = z.infer<typeof insurancePolicyFormSchema>;

export function policyScopeDisplayLabel(raw: string): string {
  if (POLICY_SCOPE_VALUES.includes(raw as PolicyScope)) {
    return POLICY_SCOPE_LABELS[raw as PolicyScope];
  }
  return raw;
}
