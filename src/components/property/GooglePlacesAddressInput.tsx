import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export interface PlaceData {
  address: string;
  google_place_id: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface GooglePlacesAddressInputProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (data: PlaceData) => void;
  placeholder?: string;
  className?: string;
}

export function GooglePlacesAddressInput({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Wyszukaj adres (Google Places)",
  className,
}: GooglePlacesAddressInputProps) {
  const [Autocomplete, setAutocomplete] = React.useState<
    React.ComponentType<{
      apiKey: string;
      onPlaceSelected: (place: {
        place_id?: string;
        formatted_address?: string;
        geometry?: { location?: { lat: () => number; lng: () => number } };
      }) => void;
      options?: { types?: string[] };
      defaultValue?: string;
      onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
      onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
      className?: string;
      placeholder?: string;
    }> | null
  >(null);

  React.useEffect(() => {
    if (!GOOGLE_API_KEY) return;
    import("react-google-autocomplete")
      .then((m) => setAutocomplete(() => m.default))
      .catch((err) => {
        console.error("[GooglePlacesAddressInput] load autocomplete:", err);
      });
  }, []);

  const handlePlaceSelect = React.useCallback(
    (place: {
      place_id?: string;
      formatted_address?: string;
      geometry?: { location?: { lat: () => number; lng: () => number } };
    }) => {
      const addr = place.formatted_address ?? value;
      if (addr) onChange(addr);
      const loc = place.geometry?.location;
      onPlaceSelect?.({
        address: addr ?? "",
        google_place_id: place.place_id ?? null,
        latitude: loc ? loc.lat() : null,
        longitude: loc ? loc.lng() : null,
      });
    },
    [onChange, onPlaceSelect, value],
  );

  if (GOOGLE_API_KEY && Autocomplete) {
    return (
      <Autocomplete
        apiKey={GOOGLE_API_KEY}
        onPlaceSelected={handlePlaceSelect}
        options={{ types: ["address"] }}
        defaultValue={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
          e.stopPropagation();
        }}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          className,
        )}
        placeholder={placeholder}
      />
    );
  }

  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={GOOGLE_API_KEY ? "Ładowanie…" : "Wpisz adres (brak klucza Google)"}
      className={className}
    />
  );
}
