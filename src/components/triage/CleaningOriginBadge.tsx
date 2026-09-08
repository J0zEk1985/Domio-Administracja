import { Badge } from "@/components/ui/badge";
import { shouldShowCleaningOriginBadge } from "@/lib/issueOrigins";

export function CleaningOriginBadge({
  issue,
}: {
  issue: { reporter_type?: string | null; source?: string | null };
}) {
  if (!shouldShowCleaningOriginBadge(issue)) return null;
  return (
    <Badge className="border-0 bg-violet-600 text-white hover:bg-violet-600/90 text-[10px] font-bold uppercase tracking-wide shrink-0 max-w-[140px] whitespace-normal text-center leading-tight">
      Zgłoszone ze sprzątania
    </Badge>
  );
}
