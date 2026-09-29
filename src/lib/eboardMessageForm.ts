import { z } from "zod";
import {
  EBOARD_DEFAULT_BG,
  EBOARD_DEFAULT_TEXT,
  HEX_COLOR_RE,
  normalizeHexColor,
} from "@/lib/eboardDisplayColors";

export const eboardMessageFormSchema = z.object({
  title: z.string().min(3, "Minimum 3 znaki."),
  content: z.string().min(10, "Minimum 10 znaków."),
  msg_type: z.enum(["official", "advertisement", "resident"]),
  community_id: z.string().uuid("Wybierz wspólnotę."),
  location_id: z.string().optional(),
  valid_until: z.string().optional(),
  display_bg_color: z
    .string()
    .regex(HEX_COLOR_RE, "Podaj kolor w formacie #RRGGBB."),
  display_text_color: z
    .string()
    .regex(HEX_COLOR_RE, "Podaj kolor w formacie #RRGGBB."),
});

export type EboardMessageFormValues = z.infer<typeof eboardMessageFormSchema>;

export const eboardMessageFormDefaults: EboardMessageFormValues = {
  title: "",
  content: "",
  msg_type: "official",
  community_id: "",
  location_id: "",
  valid_until: "",
  display_bg_color: EBOARD_DEFAULT_BG,
  display_text_color: EBOARD_DEFAULT_TEXT,
};

export function storedDisplayColor(value: string): string {
  return normalizeHexColor(value) ?? value.trim().toLowerCase();
}
