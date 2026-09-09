import { Badge } from "@/components/ui/badge";
import { issueSourceLabelPl } from "@/lib/issueOrigins";

export function IssueSourceBadge({
  issue,
}: {
  issue: { reporter_type?: string | null; source?: string | null };
}) {
  const label = issueSourceLabelPl(issue);
  const fromCleaning = label === "Sprzątanie";
  return (
    <Badge
      variant={fromCleaning ? "default" : "outline"}
      className={
        fromCleaning
          ? "border-0 bg-violet-600 text-white hover:bg-violet-600/90 text-[10px] font-bold uppercase tracking-wide shrink-0"
          : "text-[10px] font-medium shrink-0"
      }
    >
      {fromCleaning ? "Zgłoszone ze sprzątania" : `Źródło: ${label}`}
    </Badge>
  );
}
