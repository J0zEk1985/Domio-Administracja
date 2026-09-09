import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Loader2, Mic } from "lucide-react";

import { PropertyLocationCombobox } from "@/components/field/PropertyLocationCombobox";
import { ISSUE_CATEGORY_OPTIONS } from "@/lib/issueCategoryOptions";
import {
  FIELD_SERVICE_AUTO_SELECT_MAX_M,
  getFieldServiceAutoSelectLocation,
  sortLocationsByDistanceKm,
} from "@/lib/geo";
import { useCreateIssue, createIssueSchema, type CreateIssueFormValues } from "@/hooks/useCreateIssue";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { useProperties } from "@/hooks/useProperties";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type { CreateIssueFormValues };

export type CreateIssueFormProps = {
  /** Preselects building (e.g. property card, QR context). */
  defaultLocationId?: string;
  /** Invoked after successful mutation (form is reset). */
  onSuccess?: () => void;
  /** Optional cancel (e.g. close dialog). */
  onCancel?: () => void;
  /** When false, property list query is disabled (saves requests if parent never shows the form). */
  enabled?: boolean;
  /**
   * Panel terenowy: pobierz GPS przy montowaniu, posortuj budynki wg odległości,
   * wstaw domyślnie najbliższy budynek i `community_id`.
   */
  fieldServiceMode?: boolean;
  /**
   * Asystent AI (Edge triage): increment `version` to apply partial values via RHF `setValue`.
   */
  aiPrefill?: { version: number; values: Partial<CreateIssueFormValues> };
  className?: string;
};

/**
 * Shared issue creation form (same fields as the triage inbox modal). Use inside a page, sheet, or dialog.
 */
export function CreateIssueForm({
  defaultLocationId,
  onSuccess,
  onCancel,
  enabled = true,
  fieldServiceMode = false,
  aiPrefill,
  className,
}: CreateIssueFormProps) {
  const { data: properties = [], isLoading: propertiesLoading } = useProperties(enabled);
  const createMut = useCreateIssue();

  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null);
  const geoAppliedRef = useRef(false);

  const defaultFormValues = useMemo<CreateIssueFormValues>(
    () => ({
      location_id: defaultLocationId ?? "",
      community_id: "",
      category: "",
      priority: "medium",
      description: "",
    }),
    [defaultLocationId],
  );

  const form = useForm<CreateIssueFormValues>({
    resolver: zodResolver(createIssueSchema),
    defaultValues: defaultFormValues,
  });

  const { isRecording, start, stop, isSupported: speechSupported } = useSpeechToText({
    onTextUpdate: (fullText) => {
      form.setValue("description", fullText, { shouldValidate: true, shouldDirty: true });
    },
  });

  const sortedProperties = useMemo(() => {
    if (!fieldServiceMode || !userCoords) {
      return properties;
    }
    return sortLocationsByDistanceKm(properties, userCoords.lat, userCoords.lon);
  }, [properties, fieldServiceMode, userCoords]);

  useEffect(() => {
    if (!enabled || !fieldServiceMode) return;
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
        console.error("[CreateIssueForm] geolocation:", err);
        const code = (err as GeolocationPositionError).code;
        if (code === 1) {
          toast.info("Brak zgody na lokalizację — lista budynków bez sortowania GPS.");
        } else if (code === 2 || code === 3) {
          toast.info("Nie udało się ustalić pozycji — lista budynków bez sortowania GPS.");
        }
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }, [enabled, fieldServiceMode]);

  useEffect(() => {
    if (enabled) {
      geoAppliedRef.current = false;
      form.reset(defaultFormValues);
    }
  }, [enabled, defaultFormValues, form]);

  useEffect(() => {
    if (!defaultLocationId || properties.length === 0) return;
    const row = properties.find((p) => p.id === defaultLocationId);
    if (row?.communityId) {
      form.setValue("community_id", row.communityId);
    }
  }, [defaultLocationId, properties, form]);

  useEffect(() => {
    if (!fieldServiceMode || !enabled) return;
    if (defaultLocationId) return;
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
  }, [fieldServiceMode, enabled, defaultLocationId, userCoords, sortedProperties, form]);

  const watchedLocationId = useWatch({ control: form.control, name: "location_id" });

  useEffect(() => {
    if (!watchedLocationId) return;
    const row = properties.find((p) => p.id === watchedLocationId);
    if (row) {
      form.setValue("community_id", row.communityId ?? "", { shouldValidate: true });
    }
  }, [watchedLocationId, properties, form]);

  useEffect(() => {
    if (!enabled || !aiPrefill) return;
    const v = aiPrefill.values;
    if (v.location_id !== undefined) {
      form.setValue("location_id", v.location_id, { shouldValidate: true, shouldDirty: true });
      if (v.location_id === "") {
        form.setValue("community_id", "", { shouldValidate: true, shouldDirty: true });
      }
    }
    if (v.community_id !== undefined) {
      form.setValue("community_id", v.community_id ?? "", { shouldValidate: true, shouldDirty: true });
    }
    if (v.category !== undefined) {
      form.setValue("category", v.category, { shouldValidate: true, shouldDirty: true });
    }
    if (v.priority !== undefined) {
      form.setValue("priority", v.priority, { shouldValidate: true, shouldDirty: true });
    }
    if (v.description !== undefined) {
      form.setValue("description", v.description, { shouldValidate: true, shouldDirty: true });
    }
  }, [aiPrefill?.version, enabled, form, aiPrefill]);

  function onSubmit(values: CreateIssueFormValues) {
    createMut.mutate(values, {
      onSuccess: () => {
        geoAppliedRef.current = false;
        form.reset({
          location_id: defaultLocationId ?? "",
          community_id: "",
          category: "",
          priority: "medium",
          description: "",
        });
        if (defaultLocationId) {
          const row = properties.find((p) => p.id === defaultLocationId);
          if (row?.communityId) {
            form.setValue("community_id", row.communityId);
          }
        } else if (fieldServiceMode && userCoords && sortedProperties.length > 0) {
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
        onSuccess?.();
      },
    });
  }

  const pending = createMut.isPending;

  const selectedForContext = properties.find((p) => p.id === watchedLocationId);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className={cn("space-y-4", className)}>
        {fieldServiceMode && userCoords ? (
          <p className="text-xs text-muted-foreground" role="status">
            Budynki posortowano od najbliższego (GPS).
          </p>
        ) : fieldServiceMode && enabled && !userCoords && !propertiesLoading ? (
          <p className="text-xs text-muted-foreground" role="status">
            Lista alfabetyczna — włącz lokalizację w przeglądarce, aby sortować według odległości.
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
                <p className="text-xs text-muted-foreground">Budynek bez przypisanej wspólnoty.</p>
              ) : null}
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="community_id"
          render={({ field }) => <input type="hidden" {...field} />}
        />

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kategoria</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value || undefined}
                disabled={pending}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz kategorię" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ISSUE_CATEGORY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="priority"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Priorytet</FormLabel>
              <Select onValueChange={field.onChange} value={field.value} disabled={pending}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="medium">Standardowy</SelectItem>
                  <SelectItem value="critical">Pilny</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Opis problemu / zlecenie</FormLabel>
              <FormControl>
                <div className="relative">
                  <Textarea
                    {...field}
                    placeholder="Opisz miejsce, zakres i ewentualne zagrożenia (min. 10 znaków)…"
                    rows={5}
                    disabled={pending}
                    className={cn(
                      "resize-none min-h-[120px]",
                      fieldServiceMode && speechSupported && "pb-12 pr-14",
                    )}
                  />
                  {fieldServiceMode && speechSupported ? (
                    <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-2">
                      {isRecording ? (
                        <span
                          className="pointer-events-none flex items-center gap-1.5"
                          aria-hidden
                        >
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
                          </span>
                        </span>
                      ) : null}
                      <Tooltip delayDuration={200}>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            disabled={pending}
                            aria-pressed={isRecording}
                            aria-label={
                              isRecording ? "Zatrzymaj dyktowanie" : "Dyktuj — dopisz tekst na końcu pola"
                            }
                            className={cn(
                              "pointer-events-auto h-9 w-9 rounded-full shadow-sm",
                              isRecording &&
                                "border-destructive/40 text-destructive animate-pulse hover:text-destructive",
                            )}
                            onClick={() => {
                              if (isRecording) {
                                stop();
                              } else {
                                start(field.value ?? "");
                              }
                            }}
                          >
                            <Mic className="h-4 w-4" aria-hidden />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[220px]">
                          {isRecording
                            ? "Zatrzymaj nasłuchiwanie"
                            : "Dyktuj po polsku — tekst dopisze się na końcu opisu"}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  ) : null}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-2">
          {onCancel ? (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={pending}
              className="w-full sm:w-auto"
            >
              Anuluj
            </Button>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            Utwórz zgłoszenie
          </Button>
        </div>
      </form>
    </Form>
  );
}
