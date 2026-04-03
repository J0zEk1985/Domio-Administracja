import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/supabase";
import type { Company, CompanyCategory } from "@/types/contracts";

export const COMPANIES_STALE_MS = 5 * 60 * 1000;

export const companiesQueryKey = (searchQuery?: string) => ["companies", searchQuery] as const;

export type UpsertCompanyPayload = {
  name: string;
  tax_id: string;
  category: CompanyCategory;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

async function fetchCompanies(searchQuery?: string): Promise<Company[]> {
  try {
    let query = supabase
      .from("companies")
      .select("*")
      .order("name", { ascending: true })
      .limit(50);

    const term = searchQuery?.trim();
    if (term) {
      query = query.or(`name.ilike.%${term}%,tax_id.ilike.%${term}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[useCompanies] fetchCompanies:", error);
      throw error;
    }
    return (data ?? []) as Company[];
  } catch (err) {
    console.error("[useCompanies] fetchCompanies:", err);
    throw err;
  }
}

export function useCompanies(
  searchQuery?: string,
  options?: { enabled?: boolean },
): UseQueryResult<Company[], Error> {
  return useQuery({
    queryKey: companiesQueryKey(searchQuery),
    queryFn: () => fetchCompanies(searchQuery),
    staleTime: COMPANIES_STALE_MS,
    enabled: options?.enabled ?? true,
    placeholderData: (previousData) => previousData,
  });
}

export const companyByIdQueryKey = (id: string) => ["companies", "byId", id] as const;

async function fetchCompanyById(id: string): Promise<Company | null> {
  try {
    const { data, error } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
    if (error) {
      console.error("[useCompanyById] fetchCompanyById:", error);
      throw error;
    }
    return data as Company | null;
  } catch (err) {
    console.error("[useCompanyById] fetchCompanyById:", err);
    throw err;
  }
}

export function useCompanyById(id: string | undefined): UseQueryResult<Company | null, Error> {
  return useQuery({
    queryKey: id ? companyByIdQueryKey(id) : ["companies", "byId", "__none__"],
    queryFn: () => fetchCompanyById(id as string),
    enabled: Boolean(id),
    staleTime: COMPANIES_STALE_MS,
  });
}

async function upsertCompanyRpc(data: UpsertCompanyPayload): Promise<Company> {
  try {
    const { data: row, error } = await supabase.rpc("upsert_company_by_tax_id", {
      p_name: data.name,
      p_tax_id: data.tax_id,
      p_category: data.category,
      p_email: data.email ?? null,
      p_phone: data.phone ?? null,
      p_address: data.address ?? null,
    });

    if (error) {
      console.error("[useUpsertCompany] rpc:", error);
      throw error;
    }

    if (!row) {
      const missing = new Error("upsert_company_by_tax_id returned no row");
      console.error("[useUpsertCompany]", missing);
      throw missing;
    }

    return row as Company;
  } catch (err) {
    console.error("[useUpsertCompany] upsertCompanyRpc:", err);
    throw err;
  }
}

export function useUpsertCompany(): UseMutationResult<Company, Error, UpsertCompanyPayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: upsertCompanyRpc,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });
}

export type UpdateCompanyPayload = UpsertCompanyPayload & { id: string };

async function updateCompanyById(payload: UpdateCompanyPayload): Promise<Company> {
  try {
    const patch: Database["public"]["Tables"]["companies"]["Update"] = {
      name: payload.name,
      tax_id: payload.tax_id,
      category: payload.category,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      address: payload.address ?? null,
    };
    const { data, error } = await supabase.from("companies").update(patch).eq("id", payload.id).select("*").single();
    if (error) {
      console.error("[useUpdateCompany] update:", error);
      throw error;
    }
    if (!data) {
      const missing = new Error("Update company returned no row");
      console.error("[useUpdateCompany]", missing);
      throw missing;
    }
    return data as Company;
  } catch (err) {
    console.error("[useUpdateCompany] updateCompanyById:", err);
    throw err;
  }
}

export function useUpdateCompany(): UseMutationResult<Company, Error, UpdateCompanyPayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateCompanyById,
    onSuccess: (row) => {
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
      void queryClient.invalidateQueries({ queryKey: companyByIdQueryKey(row.id) });
    },
  });
}
