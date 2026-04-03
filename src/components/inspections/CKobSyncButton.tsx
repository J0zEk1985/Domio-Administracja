import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSyncCKOB } from "@/hooks/useSyncCKOB";
import { cn } from "@/lib/utils";

const MISSING_BUILDING_TOOLTIP = "Najpierw uzupełnij ID c-KOB w danych budynku.";

export interface CKobSyncButtonProps {
  locationId: string;
  cKobBuildingId: string | null;
  className?: string;
}

export function CKobSyncButton({ locationId, cKobBuildingId, className }: CKobSyncButtonProps) {
  const sync = useSyncCKOB();
  const buildingId = cKobBuildingId?.trim() ?? "";
  const canSync = buildingId.length > 0;
  const isPending = sync.isPending;

  const button = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("shrink-0 gap-1.5", className)}
      disabled={!canSync || isPending}
      onClick={() => {
        if (!canSync) return;
        sync.mutate({ locationId, cKobBuildingId: buildingId });
      }}
    >
      <RefreshCw className={cn("h-4 w-4", isPending && "animate-spin")} aria-hidden />
      Pobierz z c-KOB
    </Button>
  );

  if (!canSync) {
    return (
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <span className="inline-flex">{button}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {MISSING_BUILDING_TOOLTIP}
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}
