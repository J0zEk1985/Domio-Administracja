import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAddonAccess } from "@/hooks/useAddonAccess";
import { addonPurchaseUrl, type AddonModule } from "@/lib/addonPurchase";

type Props = {
  module: AddonModule;
  communityId?: string | null;
  featureName: string;
  children: ReactNode;
};

const copy: Record<AddonModule, { body: string; parent: string }> = {
  home: {
    body: "Funkcje aplikacji DOMIO Home dla tej wspólnoty włączają się po wykupieniu subskrypcji.",
    parent: "Moduł: DOMIO Home",
  },
  developer_warranty: {
    body: "Usterki deweloperskie włączają się po wykupieniu usługi dodatkowej.",
    parent: "Dotyczy modułu: Domio Administracja",
  },
};

export function RequireAddon({ module, communityId, featureName, children }: Props) {
  const { isLoading, isActive } = useAddonAccess(module, communityId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (isActive) return children;

  const text = copy[module];

  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6">
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-foreground">{featureName} jest nieaktywna</h3>
          <p className="text-sm text-muted-foreground">{text.body}</p>
          <p className="text-sm font-medium text-foreground">{text.parent}</p>
          <Button asChild>
            <a href={addonPurchaseUrl(module)}>Dokup w panelu DOMIO</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
