import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PropertyInspectionWithCompany } from "@/hooks/usePropertyInspections";
import type { Enums } from "@/types/supabase";
import { cn } from "@/lib/utils";

type SyncStatus = Enums<"sync_status">;

function StatusDot({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      aria-hidden
    />
  );
}

export function InspectionCKobStatusCell({ row }: { row: PropertyInspectionWithCompany }) {
  const status: SyncStatus = row.c_kob_sync_status;

  switch (status) {
    case "synced": {
      const id = row.c_kob_id?.trim();
      const trigger = (
        <div className="inline-flex items-center gap-2">
          <StatusDot className="bg-emerald-500" />
          <Badge variant="outline" className="border-emerald-500/40 font-normal text-emerald-700 dark:text-emerald-400">
            c-KOB
          </Badge>
        </div>
      );
      if (id) {
        return (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex cursor-default items-center gap-2 rounded-sm border-0 bg-transparent p-0 text-left"
              >
                {trigger}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs font-mono text-xs">
              {id}
            </TooltipContent>
          </Tooltip>
        );
      }
      return trigger;
    }
    case "pending": {
      return (
        <div className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-500" aria-hidden />
          <Badge variant="outline" className="border-amber-500/40 font-normal text-amber-700 dark:text-amber-400">
            Pobieranie…
          </Badge>
        </div>
      );
    }
    case "error": {
      const log = row.c_kob_error_log?.trim() || "Błąd synchronizacji";
      return (
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex cursor-default items-center gap-2 rounded-sm border-0 bg-transparent p-0 text-left"
            >
              <StatusDot className="bg-destructive" />
              <span className="text-sm font-medium text-destructive">Błąd</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs break-words text-sm">
            {log}
          </TooltipContent>
        </Tooltip>
      );
    }
    case "not_synced": {
      return <span className="text-sm text-muted-foreground">Własny</span>;
    }
  }
}
