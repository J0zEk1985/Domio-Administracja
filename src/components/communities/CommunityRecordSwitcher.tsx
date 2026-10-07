import { useMemo, useState } from "react";

import { RecordSwitcher } from "@/components/navigation/RecordSwitcher";
import { Skeleton } from "@/components/ui/skeleton";
import { useCommunities } from "@/hooks/useCommunities";
import { isCommunityInactive } from "@/lib/communityStatus";

type CommunityRecordSwitcherProps = {
  orgId: string;
  communityId: string;
  currentName: string;
  onSwitch: (communityId: string, name: string) => void;
};

export function CommunityRecordSwitcher({
  orgId,
  communityId,
  currentName,
  onSwitch,
}: CommunityRecordSwitcherProps) {
  const [open, setOpen] = useState(false);
  const { data, isFetching, isError, isPending } = useCommunities(orgId, {
    enabled: open,
    staleTime: 60_000,
  });

  const items = useMemo(() => {
    return (data ?? [])
      .map((community) => ({
        id: community.id,
        label: community.name,
        hint: isCommunityInactive(community.status) ? "Nieaktywna" : community.nip?.trim() || null,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pl", { sensitivity: "base" }));
  }, [data]);

  const label = currentName.trim();
  if (!label) {
    return <Skeleton className="h-8 w-64" aria-hidden />;
  }

  return (
    <RecordSwitcher
      currentId={communityId}
      currentLabel={label}
      items={items}
      open={open}
      onOpenChange={setOpen}
      onSelect={(id) => {
        const next = items.find((item) => item.id === id);
        if (!next || next.id === communityId) {
          setOpen(false);
          return;
        }
        setOpen(false);
        onSwitch(next.id, next.label);
      }}
      isLoading={open && !data && (isPending || isFetching)}
      isError={isError}
      ariaLabel="Przełącz wspólnotę"
      searchPlaceholder="Szukaj wspólnoty…"
      emptyText="Brak wspólnot."
      errorText="Nie udało się wczytać listy wspólnot."
    />
  );
}
