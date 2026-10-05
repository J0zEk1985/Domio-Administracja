import { useMemo } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { propertyDisplayName, type CommunityLocationRow } from "@/hooks/useProperties";

type Props = {
  buildings: CommunityLocationRow[];
  locationIds: string[];
  onToggle: (id: string) => void;
};

export function CatalogItemBuildingsField({ buildings, locationIds, onToggle }: Props) {
  const rows = useMemo(
    () =>
      buildings.map((building) => ({
        id: building.id,
        title: propertyDisplayName(building.name),
        address: building.address,
      })),
    [buildings],
  );

  return (
    <div className="space-y-2">
      <Label>Budynki (puste = cała wspólnota)</Label>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Brak budynków przypisanych do wspólnoty.</p>
      ) : (
        <ul className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-border/60 p-2">
          {rows.map((building) => (
            <li key={building.id} className="flex items-start gap-2">
              <Checkbox
                id={`cat-loc-${building.id}`}
                checked={locationIds.includes(building.id)}
                onCheckedChange={() => onToggle(building.id)}
              />
              <Label htmlFor={`cat-loc-${building.id}`} className="cursor-pointer font-normal leading-snug">
                {building.title ? (
                  <>
                    {building.title}
                    <span className="block text-xs text-muted-foreground">{building.address}</span>
                  </>
                ) : (
                  building.address
                )}
              </Label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
