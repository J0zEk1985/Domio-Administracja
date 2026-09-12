import { enrollBuilding, LegalEntityApiError } from "@/lib/legalEntityApi";

export type EnrollAdminLocationParams = {
  orgId: string;
  address: string;
  googlePlaceId: string;
  latitude: number | null;
  longitude: number | null;
  legalEntityId?: string | null;
};

export type EnrollAdminLocationResult =
  | { status: "created"; cleaningLocationId: string; contractorRecommended: boolean }
  | { status: "enrolled"; cleaningLocationId: string; contractorRecommended: boolean }
  | { status: "duplicate"; address: string; cleaningLocationId: string };

/**
 * Adds a building to Administration (`is_admin_active`).
 * Community/NIP is optional (private tenement is allowed).
 */
export async function enrollAdminLocation(
  params: EnrollAdminLocationParams,
): Promise<EnrollAdminLocationResult> {
  try {
    const result = await enrollBuilding({
      orgId: params.orgId,
      legalEntityId: params.legalEntityId ?? null,
      googlePlaceId: params.googlePlaceId,
      address: params.address.trim(),
      latitude: params.latitude,
      longitude: params.longitude,
      module: "admin",
    });

    if (result.status === "duplicate") {
      return {
        status: "duplicate",
        address: result.address,
        cleaningLocationId: result.cleaningLocationId,
      };
    }

    return {
      status: result.status === "created" ? "created" : "enrolled",
      cleaningLocationId: result.cleaningLocationId,
      contractorRecommended: result.contractorRecommended,
    };
  } catch (err) {
    console.error("[enrollAdminLocation]", err);
    if (err instanceof LegalEntityApiError) throw err;
    throw err;
  }
}
