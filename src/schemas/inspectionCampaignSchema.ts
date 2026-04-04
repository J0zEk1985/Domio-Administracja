import { z } from "zod";

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createInspectionCampaignSchema = z
  .object({
    title: z.string().min(1, "Podaj tytuł kampanii."),
    category: z.string().min(1, "Podaj kategorię wewnętrzną."),
    startDate: z.string().min(1, "Wybierz datę rozpoczęcia."),
    endDate: z.string().min(1, "Wybierz datę zakończenia."),
    /** Native time input value: "HH:mm" or empty string */
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    /** "__none__" or vendor UUID */
    vendorId: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.endDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Data zakończenia nie może być wcześniejsza niż początek.",
        path: ["endDate"],
      });
    }
    const st = data.startTime?.trim() ?? "";
    const et = data.endTime?.trim() ?? "";
    if (st && !HH_MM.test(st)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Użyj formatu HH:mm (np. 16:00).",
        path: ["startTime"],
      });
    }
    if (et && !HH_MM.test(et)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Użyj formatu HH:mm.",
        path: ["endTime"],
      });
    }
    if ((st && !et) || (!st && et)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Podaj obie godziny albo zostaw oba pola puste.",
        path: ["endTime"],
      });
    }
  });

export type CreateInspectionCampaignFormValues = z.infer<typeof createInspectionCampaignSchema>;
