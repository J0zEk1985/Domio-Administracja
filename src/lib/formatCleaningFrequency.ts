import type { CleaningFrequencyConfig } from "@/types/cleaningWorkScope";

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Codziennie",
  work_days: "Codziennie w dni robocze (Pn–Pt)",
  specific_days: "W określone dni tygodnia",
  weekly: "Raz na tydzień",
  biweekly: "Raz na dwa tygodnie",
  monthly: "Raz na miesiąc",
  quarterly: "Raz na kwartał",
  custom: "Inne",
};

const DAY_NAMES = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nie"] as const;

export function formatCleaningFrequency(
  frequency: string | null,
  config: CleaningFrequencyConfig | null,
): string {
  const type = config?.type;
  if (!type) {
    const text = frequency?.trim();
    return text && text.length > 0 ? text : "—";
  }
  if (type === "specific_days" && config.days && config.days.length > 0) {
    return config.days
      .filter((d) => d >= 0 && d <= 6)
      .map((d) => DAY_NAMES[d])
      .join(", ");
  }
  if (type === "custom") {
    const custom = config.text?.trim();
    return custom && custom.length > 0 ? custom : FREQUENCY_LABELS.custom;
  }
  return FREQUENCY_LABELS[type] ?? frequency?.trim() ?? "—";
}
