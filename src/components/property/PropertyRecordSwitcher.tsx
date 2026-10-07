import { useMemo, useState } from "react";

import { RecordSwitcher } from "@/components/navigation/RecordSwitcher";
import { Skeleton } from "@/components/ui/skeleton";
import { usePropertySwitcherOptions } from "@/hooks/usePropertySwitcherOptions";
import { propertyBuildingParts } from "@/hooks/useProperties";

type PropertyRecordSwitcherProps = {
  propertyId: string;
  currentName: string;
  onSwitch: (propertyId: string, name: string) => void;
};

export function PropertyRecordSwitcher({ propertyId, currentName, onSwitch }: PropertyRecordSwitcherProps) {
  const [open, setOpen] = useState(false);
  const { data, isFetching, isError, isPending } = usePropertySwitcherOptions(open);

  const items = useMemo(() => {
    return (data ?? [])
      .map((row) => {
        const parts = propertyBuildingParts(row.name, row.address);
        return { id: row.id, label: parts.title, hint: parts.subtitle };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "pl", { sensitivity: "base" }));
  }, [data]);

  const label = currentName.trim();
  if (!label) {
    return <Skeleton className="h-8 w-72" aria-hidden />;
  }

  return (
    <RecordSwitcher
      currentId={propertyId}
      currentLabel={label}
      items={items}
      open={open}
      onOpenChange={setOpen}
      onSelect={(id) => {
        const next = items.find((item) => item.id === id);
        if (!next || next.id === propertyId) {
          setOpen(false);
          return;
        }
        setOpen(false);
        onSwitch(next.id, next.label);
      }}
      isLoading={open && !data && (isPending || isFetching)}
      isError={isError}
      ariaLabel="Przełącz budynek"
      searchPlaceholder="Szukaj budynku…"
      emptyText="Brak budynków."
      errorText="Nie udało się wczytać listy budynków."
    />
  );
}
