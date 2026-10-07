/**
 * Create or edit a developer warranty issue.
 * Editing is limited to drafts that have not been published yet.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useCreateWarrantyIssue, useUpdateWarrantyIssue } from "@/hooks/useDeveloperWarranty";
import { useLocationsByCommunity } from "@/hooks/useProperties";
import {
  DEVELOPER_WARRANTY_ISSUE_PRIORITY_LABELS,
  type DeveloperWarrantyIssue,
} from "@/types/developer-warranty";
import { toast } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { PhotoUpload } from "@/components/warranty/PhotoUpload";
import { useWarrantyPhotoUpload } from "@/hooks/useWarrantyPhotoUpload";
import { useCommunities } from "@/hooks/useCommunities";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type WarrantyIssueDraft = Pick<
  DeveloperWarrantyIssue,
  | "id"
  | "community_id"
  | "status"
  | "title"
  | "description"
  | "category"
  | "location_master_id"
  | "location_detail"
  | "priority"
  | "photos_reported"
>;

const NO_BUILDING = "__none__";

const CATEGORIES = [
  "Hydraulika",
  "Elektryka",
  "Wentylacja",
  "Stolarka",
  "Ślusarka",
  "Elewacja",
  "Dach",
  "Instalacje",
  "Wykończenia",
  "Inne",
];

const formSchema = z.object({
  community_id: z.string().min(1, "Wspólnota jest wymagana"),
  title: z
    .string()
    .min(1, "Tytuł jest wymagany")
    .max(255, "Tytuł nie może przekraczać 255 znaków"),
  description: z.string().optional(),
  category: z.string().optional(),
  location_master_id: z.string().optional(),
  location_detail: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateWarrantyIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId?: string; // Optional - if not provided, user selects from dropdown
  orgId?: string; // Optional - will be derived from selected community
  issue?: WarrantyIssueDraft | null;
}

function emptyFormValues(communityId = ""): FormValues {
  return {
    community_id: communityId,
    title: "",
    description: "",
    category: "",
    location_master_id: "",
    location_detail: "",
    priority: "normal",
  };
}

function formValuesFromIssue(issue: WarrantyIssueDraft): FormValues {
  return {
    community_id: issue.community_id,
    title: issue.title,
    description: issue.description ?? "",
    category: issue.category ?? "",
    location_master_id: issue.location_master_id ?? "",
    location_detail: issue.location_detail ?? "",
    priority: issue.priority,
  };
}

export function CreateWarrantyIssueDialog({
  open,
  onOpenChange,
  communityId: propCommunityId,
  orgId: propOrgId,
  issue = null,
}: CreateWarrantyIssueDialogProps) {
  const isEdit = issue != null;
  const [photos, setPhotos] = useState<string[]>(issue?.photos_reported ?? []);
  const createMutation = useCreateWarrantyIssue();
  const updateMutation = useUpdateWarrantyIssue();
  const { deletePhoto } = useWarrantyPhotoUpload();
  const isSaving = createMutation.isPending || updateMutation.isPending;
  
  const { data: userOrgId } = useQuery({
    queryKey: ["org-id"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_org_id_safe");
      if (error) throw error;
      return data as string | null;
    },
    enabled: open && !propCommunityId && !propOrgId,
  });

  const { data: communities, isLoading: communitiesLoading } = useCommunities(
    userOrgId ?? null
  );
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: issue ? formValuesFromIssue(issue) : emptyFormValues(propCommunityId || ""),
  });

  const selectedCommunityId = form.watch("community_id") || propCommunityId;
  const selectedCommunity = communities?.find((c) => c.id === selectedCommunityId);
  
  const { data: locations, isLoading: locationsLoading } = useLocationsByCommunity(
    selectedCommunityId || "",
    {
      enabled: !!selectedCommunityId && open,
    }
  );

  const handleSubmit = async (values: FormValues) => {
    if (isEdit && issue) {
      if (issue.status !== "draft") {
        toast.error("Można edytować tylko usterkę w statusie szkicu.");
        return;
      }

      const savedPhotos = issue.photos_reported ?? [];
      try {
        await updateMutation.mutateAsync({
          id: issue.id,
          dto: {
            title: values.title.trim(),
            description: values.description?.trim() || null,
            category: values.category || null,
            location_master_id: values.location_master_id || null,
            location_detail: values.location_detail?.trim() || null,
            priority: values.priority,
            photos_reported: photos,
          },
        });

        const removedPhotos = savedPhotos.filter((path) => !photos.includes(path));
        await Promise.all(removedPhotos.map((path) => deletePhoto(path)));

        toast.success("Zmiany w usterce zostały zapisane");
        onOpenChange(false);
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : "";
        if (message.includes("szkicu")) {
          toast.error(message);
        } else if (message.toLowerCase().includes("row-level security")) {
          toast.error("Nie udało się zapisać zmian. Brak uprawnień.");
        } else {
          toast.error("Nie udało się zapisać zmian w usterce");
        }
      }
      return;
    }

    const communityId = values.community_id || propCommunityId;
    const orgId = propOrgId || selectedCommunity?.org_id;

    if (!communityId) {
      toast.error("Wybierz wspólnotę");
      return;
    }

    if (!orgId) {
      toast.error("Nie można określić organizacji dla wybranej wspólnoty");
      return;
    }

    try {
      await createMutation.mutateAsync({
        community_id: communityId,
        title: values.title,
        description: values.description || undefined,
        category: values.category || undefined,
        location_master_id: values.location_master_id || undefined,
        location_detail: values.location_detail || undefined,
        priority: values.priority,
        photos_reported: photos.length > 0 ? photos : undefined,
      });

      toast.success("Usterka została utworzona jako szkic");
      form.reset(emptyFormValues(propCommunityId || ""));
      setPhotos([]);
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : "";
      if (message.includes("location_master") || message.includes("locations")) {
        toast.error("Nie udało się utworzyć usterki. Wybrany budynek jest nieprawidłowy.");
      } else if (message.includes("organizacji") || message.includes("org_id")) {
        toast.error("Nie udało się utworzyć usterki. Brak organizacji.");
      } else if (message.toLowerCase().includes("row-level security")) {
        toast.error("Nie udało się utworzyć usterki. Brak uprawnień.");
      } else {
        toast.error("Nie udało się utworzyć usterki");
      }
    }
  };

  const handleClose = () => {
    if (issue) {
      form.reset(formValuesFromIssue(issue));
      setPhotos(issue.photos_reported ?? []);
    } else {
      form.reset(emptyFormValues(propCommunityId || ""));
      setPhotos([]);
    }
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edytuj usterkę deweloperską" : "Dodaj usterkę deweloperską"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Popraw dane szkicu przed publikacją. Usterka pozostanie szkicem, dopóki jej nie opublikujesz."
              : "Utwórz nową usterkę objętą rękojmią deweloperską. Usterka zostanie zapisana jako szkic."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {!propCommunityId && !isEdit && (
              <FormField
                control={form.control}
                name="community_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Wspólnota *</FormLabel>
                    {communitiesLoading ? (
                      <Skeleton className="h-10 w-full" />
                    ) : (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Wybierz wspólnotę" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {communities?.map((community) => (
                            <SelectItem key={community.id} value={community.id}>
                              {community.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <FormDescription>
                      Wybierz wspólnotę, w której występuje usterka
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tytuł usterki *</FormLabel>
                  <FormControl>
                    <Input placeholder="np. Przeciek w instalacji c.o." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Opis</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Szczegółowy opis usterki..."
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Opisz problem tak dokładnie, jak to możliwe
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kategoria</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz kategorię" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz priorytet" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(DEVELOPER_WARRANTY_ISSUE_PRIORITY_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="location_master_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Budynek</FormLabel>
                  {locationsLoading ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select
                      onValueChange={(value) =>
                        field.onChange(value === NO_BUILDING ? "" : value)
                      }
                      value={field.value || NO_BUILDING}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz budynek (opcjonalnie)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_BUILDING}>Nie dotyczy konkretnego budynku</SelectItem>
                        {locations
                          ?.filter((location) => location.locationMasterId)
                          .map((location) => (
                          <SelectItem key={location.id} value={location.locationMasterId!}>
                            {location.address}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormDescription>
                    Wybierz budynek, jeśli usterka dotyczy konkretnej nieruchomości
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="location_detail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lokalizacja szczegółowa</FormLabel>
                  <FormControl>
                    <Input placeholder="np. Klatka A, parter, korytarz" {...field} />
                  </FormControl>
                  <FormDescription>
                    Dokładne miejsce wystąpienia usterki
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <PhotoUpload
              photos={photos}
              onPhotosChange={setPhotos}
              label="Zdjęcia dokumentujące usterkę"
              description="Dodaj zdjęcia pokazujące problem (opcjonalnie)"
              maxPhotos={6}
              disabled={isSaving}
              retainOnRemove={issue?.photos_reported ?? []}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={isSaving}>
                Anuluj
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isEdit
                  ? updateMutation.isPending
                    ? "Zapisywanie..."
                    : "Zapisz zmiany"
                  : createMutation.isPending
                    ? "Tworzenie..."
                    : "Utwórz szkic"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
