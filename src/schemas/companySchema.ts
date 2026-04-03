import { z } from "zod";

import type { CompanyCategory } from "@/types/contracts";

export const COMPANY_CATEGORIES = ["contractor", "insurer", "utility", "other"] as const satisfies readonly CompanyCategory[];

export const COMPANY_CATEGORY_LABELS: Record<(typeof COMPANY_CATEGORIES)[number], string> = {
  contractor: "Wykonawca",
  insurer: "Ubezpieczyciel",
  utility: "Usługa komunalna",
  other: "Inne",
};

const optionalTrimmed = z
  .string()
  .optional()
  .transform((v) => {
    if (v === undefined || v === null) return undefined;
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  });

export const companyFormSchema = z.object({
  name: z.string().trim().min(2, "Nazwa musi mieć co najmniej 2 znaki"),
  tax_id: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().regex(/^[0-9]{10}$/, "NIP musi składać się z 10 cyfr")),
  category: z.enum(COMPANY_CATEGORIES).default("contractor"),
  email: optionalTrimmed,
  phone: optionalTrimmed,
  address: optionalTrimmed,
});

export type CompanyFormValues = z.infer<typeof companyFormSchema>;

export const companyFormDefaultValues: CompanyFormValues = {
  name: "",
  tax_id: "",
  category: "contractor",
  email: undefined,
  phone: undefined,
  address: undefined,
};

export function parseCompanySearchSeed(query: string | undefined): Partial<CompanyFormValues> {
  const t = query?.trim() ?? "";
  if (!t) return {};
  const digits = t.replace(/\D/g, "");
  if (digits.length === 10) {
    return { tax_id: digits };
  }
  return { name: t };
}
