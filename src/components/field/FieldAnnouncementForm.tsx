import { useEffect, useMemo, useRef, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { CalendarIcon, Loader2, Mic } from "lucide-react";
import { z } from "zod";

import { PropertyLocationCombobox } from "@/components/field/PropertyLocationCombobox";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateEBoardMessage } from "@/hooks/useEBoardMessages";
import { useProperties } from "@/hooks/useProperties";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import {
  FIELD_SERVICE_AUTO_SELECT_MAX_M,
  getFieldServiceAutoSelectLocation,
  sortLocationsByDistanceKm,
} from "@/lib/geo";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";

const fieldAnnouncementSchema = z.object({
  location_id: z.string().uuid("Wybierz budynek."),
  community_id: z.string().uuid("Budynek musi mieć przypisaną wspólnotę."),
  title: z.string().min(3, "Minimum 3 znaki."),
  content: z.string().min(10, "Minimum 10 znaków."),
  msg_type: z.enum(["official", "advertisement", "resident"]),
  valid_until: z.string().optional(),
});

type FieldAnnouncementFormValues = z.infer<typeof fieldAnnouncementSchema>;

const emptyValues: FieldAnnouncementFormValues = {
  location_id: "",
  community_id: "",
  title: "",
  content: "",
  msg_type: "official",
  valid_until: "",
};

export function FieldAnnouncementForm({ enabled = true }: { enabled?: boolean }) {
  const { data: properties = [], isLoading: propertiesLoading } = useProperties(enabled);
  const createMut = useCreateEBoardMessage();

  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null);
  const geoAppliedRef = useRef(false);

  const form = useForm<FieldAnnouncementFormValues>({
    resolver: zodResolver(fieldAnnouncementSchema),
    defaultValues: emptyValues,
  });

  const { isRecording, start, stop, isSupported: speechSupported } = useSpeechToText({
    onTextUpdate: (fullText) => {
      form.setValue("content", fullText, { shouldValidate: true, shouldDirty: true });
    },
  });

  const sortedProperties = useMemo(() => {
    if (!userCoords) return properties;
    return sortLocationsByDistanceKm(properties, userCoords.lat, userCoords.lon);
  }, [properties, userCoords]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
      },
      (err) => {
        console.error("[FieldAnnouncementForm] geolocation:", err);
        const code = (err as GeolocationPositionError).code;
        if (code === 1) {
          toast.info("Brak zgody na lokalizację — lista budynków bez sortowania GPS.");
        } else if (code === 2 || code === 3) {
          toast.info("Nie udało się ustalić pozycji — lista budynków bez sortowania GPS.");
        }
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      geoAppliedRef.current = false;
      form.reset(emptyValues);
    }
  }, [enabled, form]);

  useEffect(() => {
    if (!enabled) return;
    if (!userCoords || sortedProperties.length === 0) return;
    if (geoAppliedRef.current) return;

    const pick = getFieldServiceAutoSelectLocation(
      sortedProperties,
      userCoords.lat,
      userCoords.lon,
      FIELD_SERVICE_AUTO_SELECT_MAX_M,
    );
    geoAppliedRef.current = true;
    if (!pick) {
      toast.info(
        "Najbliższy budynek jest dalej niż 2 km lub brak współrzędnych na liście — wybierz lokalizację ręcznie.",
      );
      return;
    }
    form.setValue("location_id", pick.row.id, { shouldValidate: true });
    form.setValue("community_id", pick.row.communityId ?? "", { shouldValidate: true });
  }, [enabled, userCoords, sortedProperties, form]);

  const watchedLocationId = useWatch({ control: form.control, name: "location_id" });

  useEffect(() => {
    if (!watchedLocationId) return;
    const row = properties.find((p) => p.id === watchedLocationId);
    if (row) {
      form.setValue("community_id", row.communityId ?? "", { shouldValidate: true });
    }
  }, [watchedLocationId, properties, form]);

  const selectedForContext = properties.find((p) => p.id === watchedLocationId);
  const pending = createMut.isPending;

  function applyNearestBuilding() {
    if (!userCoords || sortedProperties.length === 0) return;
    const pick = getFieldServiceAutoSelectLocation(
      sortedProperties,
      userCoords.lat,
      userCoords.lon,
      FIELD_SERVICE_AUTO_SELECT_MAX_M,
    );
    if (pick) {
      form.setValue("location_id", pick.row.id);
      form.setValue("community_id", pick.row.communityId ?? "");
      geoAppliedRef.current = true;
    }
  }

  function onSubmit(values: FieldAnnouncementFormValues) {
    const validUntil =
      values.valid_until && values.valid_until.trim() !== "" ? values.valid_until.trim() : null;
    createMut.mutate(
      {
        title: values.title,
        content: values.content,
        msg_type: values.msg_type,
        community_id: values.community_id,
        location_id: values.location_id,
        valid_until: validUntil,
      },
      {
        onSuccess: () => {
          geoAppliedRef.current = false;
          form.reset(emptyValues);
          applyNearestBuilding();
        },
      },
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {userCoords ? (
          <p className="text-xs text-muted-foreground" role="status">
            Budynki posortowano od najbliższego (GPS). Ogłoszenie trafi na tablicę wybranego budynku.
          </p>
        ) : enabled && !propertiesLoading ? (
          <p className="text-xs text-muted-foreground" role="status">
            Lista alfabetyczna — włącz lokalizację w przeglądarce, aby wybrać nieruchomość po GPS.
          </p>
        ) : null}

        <FormField
          control={form.control}
          name="location_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Budynek</FormLabel>
              <FormControl>
                <PropertyLocationCombobox
                  properties={sortedProperties}
                  isLoading={propertiesLoading}
                  value={field.value}
                  onChange={field.onChange}
                  disabled={pending}
                />
              </FormControl>
              <FormMessage />
              {selectedForContext?.communityId ? (
                <p className="text-xs text-muted-foreground">
                  Wspólnota:{" "}
                  <span className="text-foreground/90">
                    {selectedForContext.communityName?.trim() || selectedForContext.communityId}
                  </span>
                </p>
              ) : selectedForContext ? (
                <p className="text-xs text-destructive">
                  Ten budynek nie ma wspólnoty — ogłoszenie wymaga przypisania wspólnoty w kartotece.
                </p>
              ) : null}
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="community_id"
          render={() => (
            <FormItem className="space-y-0">
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tytuł</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Krótki nagłówek" disabled={pending} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Treść</FormLabel>
              <FormControl>
                <div className="relative">
                  <Textarea
                    {...field}
                    rows={6}
                    placeholder="Treść ogłoszenia…"
                    disabled={pending}
                    className={cn("resize-none", speechSupported && "pb-12 pr-14")}
                  />
                  {speechSupported ? (
                    <Button
                      type="button"
                      size="icon"
                      variant={isRecording ? "destructive" : "secondary"}
                      className={cn(
                        "absolute bottom-3 right-3 h-11 w-11 rounded-full shadow-md",
                        isRecording && "animate-pulse",
                      )}
                      disabled={pending}
                      aria-pressed={isRecording}
                      aria-label={isRecording ? "Zatrzymaj dyktowanie" : "Dyktuj treść mikrofonem"}
                      onClick={() => {
                        if (isRecording) {
                          stop();
                        } else {
                          start(field.value);
                        }
                      }}
                    >
                      <Mic className="h-5 w-5" aria-hidden />
                    </Button>
                  ) : null}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="msg_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Typ ogłoszenia</FormLabel>
              <Select onValueChange={field.onChange} value={field.value} disabled={pending}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="official">Oficjalne</SelectItem>
                  <SelectItem value="advertisement">Reklama</SelectItem>
                  <SelectItem value="resident">Mieszkaniec</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="valid_until"
          render={({ field }) => {
            const parsed = field.value ? parseISO(field.value) : undefined;
            const selected = parsed && isValid(parsed) ? parsed : undefined;
            return (
              <FormItem className="flex flex-col">
                <FormLabel>Ważne do (opcjonalnie)</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        className={cn(
                          "h-10 w-full justify-start pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-60" aria-hidden />
                        {selected ? format(selected, "d MMM yyyy", { locale: pl }) : "Wybierz datę"}
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selected}
                      onSelect={(d) => field.onChange(d ? format(d, "yyyy-MM-dd") : "")}
                      locale={pl}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
          Opublikuj ogłoszenie
        </Button>
      </form>
    </Form>
  );
}
