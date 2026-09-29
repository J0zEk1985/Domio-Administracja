import { useEffect } from "react";
import { format, isValid, parseISO } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";

import { EBoardMessageFormFields } from "@/components/eboard/EBoardMessageFormFields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import {
  useCreateEBoardMessage,
  useUpdateEBoardMessage,
  type EBoardMessageListItem,
} from "@/hooks/useEBoardMessages";
import { useLocationsByCommunity, type CommunityLocationRow } from "@/hooks/useProperties";
import {
  EBOARD_DEFAULT_BG,
  EBOARD_DEFAULT_TEXT,
  isHexColor,
} from "@/lib/eboardDisplayColors";
import {
  eboardMessageFormDefaults,
  eboardMessageFormSchema,
  storedDisplayColor,
  type EboardMessageFormValues,
} from "@/lib/eboardMessageForm";

type CommunityOption = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId?: string;
  communityName?: string;
  communities?: CommunityOption[];
  buildings?: CommunityLocationRow[];
  message?: EBoardMessageListItem | null;
};

function dateInputFromIso(iso: string | null | undefined): string {
  if (!iso?.trim()) return "";
  try {
    const d = parseISO(iso);
    if (!isValid(d)) return "";
    return format(d, "yyyy-MM-dd");
  } catch {
    return "";
  }
}

function valuesFromMessage(
  message: EBoardMessageListItem | null | undefined,
  fallbackCommunityId: string,
): EboardMessageFormValues {
  if (!message) {
    return { ...eboardMessageFormDefaults, community_id: fallbackCommunityId };
  }
  return {
    title: message.title,
    content: message.content,
    msg_type: message.msg_type,
    community_id: message.community_id ?? fallbackCommunityId,
    location_id: message.location_id ?? "",
    valid_until: dateInputFromIso(message.valid_until),
    display_bg_color: isHexColor(message.display_bg_color)
      ? message.display_bg_color
      : EBOARD_DEFAULT_BG,
    display_text_color: isHexColor(message.display_text_color)
      ? message.display_text_color
      : EBOARD_DEFAULT_TEXT,
  };
}

export function CommunityCreateAnnouncementDialog({
  open,
  onOpenChange,
  communityId,
  communityName,
  communities,
  buildings: buildingsProp,
  message,
}: Props) {
  const createMut = useCreateEBoardMessage();
  const updateMut = useUpdateEBoardMessage();
  const isEdit = Boolean(message?.id);
  const pending = createMut.isPending || updateMut.isPending;
  const lockedCommunityId = communityId?.trim() || "";
  const showCommunitySelect = !lockedCommunityId && (communities?.length ?? 0) > 0;

  const form = useForm<EboardMessageFormValues>({
    resolver: zodResolver(eboardMessageFormSchema),
    defaultValues: valuesFromMessage(message, lockedCommunityId),
  });

  const watchedCommunityId = form.watch("community_id");
  const fetchCommunityId = lockedCommunityId || watchedCommunityId;

  const { data: fetchedBuildings = [], isLoading: buildingsLoading } = useLocationsByCommunity(
    fetchCommunityId || undefined,
    { enabled: open && Boolean(fetchCommunityId) && !buildingsProp },
  );
  const buildings = buildingsProp ?? fetchedBuildings;

  useEffect(() => {
    if (!open) return;
    form.reset(valuesFromMessage(message, lockedCommunityId));
  }, [open, message, lockedCommunityId, form]);

  useEffect(() => {
    if (lockedCommunityId || isEdit) return;
    form.setValue("location_id", "");
  }, [watchedCommunityId, lockedCommunityId, isEdit, form]);

  function onSubmit(values: EboardMessageFormValues) {
    const resolvedCommunityId = lockedCommunityId || values.community_id;
    const locationId =
      values.location_id && values.location_id.trim() !== "" ? values.location_id.trim() : null;
    const validUntil =
      values.valid_until && values.valid_until.trim() !== "" ? values.valid_until.trim() : null;
    const display_bg_color = storedDisplayColor(values.display_bg_color);
    const display_text_color = storedDisplayColor(values.display_text_color);

    if (isEdit && message) {
      updateMut.mutate(
        {
          id: message.id,
          community_id: resolvedCommunityId,
          updates: {
            title: values.title.trim(),
            content: values.content.trim(),
            msg_type: values.msg_type,
            community_id: resolvedCommunityId,
            location_id: locationId,
            valid_until: validUntil,
            display_bg_color,
            display_text_color,
          },
        },
        { onSuccess: () => onOpenChange(false) },
      );
      return;
    }

    createMut.mutate(
      {
        title: values.title,
        content: values.content,
        msg_type: values.msg_type,
        community_id: resolvedCommunityId,
        location_id: locationId,
        valid_until: validUntil,
        display_bg_color,
        display_text_color,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  const description = isEdit
    ? "Zmiany będą widoczne na tablicy ogłoszeń budynku."
    : communityName
      ? `Ogłoszenie dla wspólnoty ${communityName}. Budynek jest opcjonalny — bez niego komunikat obejmuje całą wspólnotę.`
      : "Uzupełnij treść i zasięg. Budynek jest opcjonalny — bez niego komunikat obejmuje całą wspólnotę.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edytuj ogłoszenie" : "Nowe ogłoszenie"}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <EBoardMessageFormFields
              form={form}
              pending={pending}
              showCommunitySelect={showCommunitySelect}
              communities={communities ?? []}
              fetchCommunityId={fetchCommunityId}
              buildings={buildings}
              buildingsLoading={!buildingsProp && buildingsLoading}
            />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                Anuluj
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                {isEdit ? "Zapisz" : "Opublikuj"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
