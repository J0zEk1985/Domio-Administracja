import { z } from "zod";

import type { Company, CompanyCategory } from "@/types/contracts";

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

export function companyRowToFormValues(company: Company): CompanyFormValues {
  const cat = company.category;
  const category = COMPANY_CATEGORIES.includes(cat as (typeof COMPANY_CATEGORIES)[number])
    ? (cat as CompanyFormValues["category"])
    : "contractor";
  return {
    name: company.name.trim(),
    tax_id: company.tax_id.replace(/\D/g, "").slice(0, 10),
    category,
    email: company.email?.trim() ? company.email.trim() : undefined,
    phone: company.phone?.trim() ? company.phone.trim() : undefined,
    address: company.address?.trim() ? company.address.trim() : undefined,
  };
}
