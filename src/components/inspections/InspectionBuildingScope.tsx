import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { propertyBuildingLabel } from "@/hooks/useProperties";

export type InspectionBuildingOption = {
  id: string;
  name: string;
  address: string;
};

export function inspectionBuildingOptionLabel(building: InspectionBuildingOption): string {
  return propertyBuildingLabel(building.name, building.address);
}

type Props = {
  buildings: InspectionBuildingOption[];
  mode: "all" | "selected";
  onModeChange: (mode: "all" | "selected") => void;
  selectedIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  disabled?: boolean;
};

export function InspectionBuildingScope({
  buildings,
  mode,
  onModeChange,
  selectedIds,
  onToggle,
  disabled,
}: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="grid gap-2" role="radiogroup" aria-label="Zakres budynków">
        <div className="flex items-start gap-2">
          <input
            type="radio"
            id="inspection-scope-all"
            name="inspection-building-scope"
            className="mt-1"
            checked={mode === "all"}
            disabled={disabled}
            onChange={() => onModeChange("all")}
          />
          <Label htmlFor="inspection-scope-all" className="cursor-pointer font-medium leading-snug">
            Wszystkie budynki we wspólnocie
          </Label>
        </div>
        <div className="flex items-start gap-2">
          <input
            type="radio"
            id="inspection-scope-selected"
            name="inspection-building-scope"
            className="mt-1"
            checked={mode === "selected"}
            disabled={disabled}
            onChange={() => onModeChange("selected")}
          />
          <Label htmlFor="inspection-scope-selected" className="cursor-pointer font-medium leading-snug">
            Tylko wybrane budynki
          </Label>
        </div>
      </div>

      {mode === "selected" ? (
        <ul className="max-h-40 space-y-2 overflow-y-auto pl-1">
          {buildings.map((building) => {
            const inputId = `inspection-building-${building.id}`;
            return (
              <li key={building.id} className="flex items-start gap-2">
                <Checkbox
                  id={inputId}
                  checked={selectedIds.has(building.id)}
                  disabled={disabled}
                  onCheckedChange={(checked) => onToggle(building.id, checked === true)}
                />
                <Label htmlFor={inputId} className="cursor-pointer text-sm font-normal leading-snug">
                  {inspectionBuildingOptionLabel(building)}
                </Label>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          Ten sam protokół zostanie zapisany osobno przy każdym budynku wspólnoty ({buildings.length}).
        </p>
      )}
    </div>
  );
}
