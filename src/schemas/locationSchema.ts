import { z } from "zod";

const CKOB_BUILDING_ID_MAX_LEN = 256;

/**
 * Optional external ID for państwowy system c-KOB (`cleaning_locations.c_kob_building_id`).
 * Empty or whitespace-only input normalizes to `null` for persistence.
 */
export const propertyLocationFormSchema = z
  .object({
    c_kob_building_id: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    const t = (val.c_kob_building_id ?? "").trim();
    if (t.length > CKOB_BUILDING_ID_MAX_LEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ID jest zbyt długie",
        path: ["c_kob_building_id"],
      });
    }
  })
  .transform((o) => {
    const t = (o.c_kob_building_id ?? "").trim();
    return {
      cKobBuildingId: t === "" ? null : t,
    };
  });

export type PropertyLocationFormNormalized = z.infer<typeof propertyLocationFormSchema>;
