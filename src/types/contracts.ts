/**
 * Companies, property contracts & insurance policies — domain types aligned with
 * Supabase tables: `companies`, `property_contracts`, `property_policies`.
 */

import type { Enums, Tables } from "./supabase";

export type CompanyCategory = Enums<"company_category">;

export type PropertyContractType = Enums<"property_contract_type">;

/**
 * Global company directory: one row per `tax_id` (NIP) across the ecosystem.
 * No `org_id` — isolation is enforced on operational tables (contracts/policies).
 */
export type Company = Tables<"companies">;

/**
 * Building contract (1:1 with `cleaning_locations` via `location_id`).
 * Optional `company` / `location` for PostgREST eager selects.
 *
 * **Financial & date fields (AI / n8n automation):**
 * - `net_value` — net contract amount; pair with `currency`.
 * - `currency` — billing currency code (DB default PLN).
 * - `start_date` / `end_date` — contract period; `end_date` may be null (open-ended).
 * - `notice_period_months` — termination notice length in months.
 * - `document_url` — scanned contract / Storage URL (empty until uploaded).
 */
export interface PropertyContract extends Tables<"property_contracts"> {
  company?: Partial<Company>;
  location?: Partial<Tables<"cleaning_locations">>;
}

/**
 * Insurance policy bound to a building and insurer (`company_id`).
 * Optional `company` / `location` for PostgREST eager selects.
 *
 * **Financial & date fields (AI / n8n automation):**
 * - `coverage_amount` — sum insured / coverage limit.
 * - `premium_amount` — premium (składka); DB default 0 until filled.
 * - `start_date` / `end_date` — policy validity (both required in DB).
 * - `document_url` — policy PDF / Storage URL (empty until uploaded).
 */
export interface PropertyPolicy extends Tables<"property_policies"> {
  company?: Partial<Company>;
  location?: Partial<Tables<"cleaning_locations">>;
}
