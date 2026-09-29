import type { Control } from "react-hook-form";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  EBOARD_DEFAULT_BG,
  EBOARD_DEFAULT_TEXT,
  isHexColor,
} from "@/lib/eboardDisplayColors";
import type { EboardMessageFormValues } from "@/lib/eboardMessageForm";

type Props = {
  control: Control<EboardMessageFormValues>;
  disabled?: boolean;
  onResetDefaults: () => void;
};

function ColorInput({
  value,
  onChange,
  disabled,
  fallback,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  fallback: string;
  "aria-label": string;
}) {
  const pickerValue = isHexColor(value) ? value : fallback;
  return (
    <div className="flex gap-2">
      <input
        type="color"
        aria-label={ariaLabel}
        value={pickerValue}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <Input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={fallback}
        className="font-mono uppercase"
        maxLength={7}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}

export function EBoardDisplayColorFields({ control, disabled, onResetDefaults }: Props) {
  return (
    <div className="space-y-3 rounded-md border border-border/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Kolory na tablicy</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Widoczne tylko na ekranie budynku. Aplikacja Home bez zmian.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 gap-1.5"
          disabled={disabled}
          onClick={onResetDefaults}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Domyślne
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={control}
          name="display_bg_color"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tło</FormLabel>
              <FormControl>
                <ColorInput
                  value={field.value}
                  onChange={field.onChange}
                  disabled={disabled}
                  fallback={EBOARD_DEFAULT_BG}
                  aria-label="Kolor tła tablicy"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="display_text_color"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Napisy</FormLabel>
              <FormControl>
                <ColorInput
                  value={field.value}
                  onChange={field.onChange}
                  disabled={disabled}
                  fallback={EBOARD_DEFAULT_TEXT}
                  aria-label="Kolor napisów na tablicy"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name="display_bg_color"
        render={({ field: bgField }) => (
          <FormField
            control={control}
            name="display_text_color"
            render={({ field: textField }) => {
              const bg = isHexColor(bgField.value) ? bgField.value : EBOARD_DEFAULT_BG;
              const text = isHexColor(textField.value) ? textField.value : EBOARD_DEFAULT_TEXT;
              return (
                <div
                  className="rounded-md px-3 py-4 text-center"
                  style={{ backgroundColor: bg, color: text }}
                >
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] opacity-70">
                    Podgląd tablicy
                  </p>
                  <p className="mt-1 font-display text-lg font-semibold leading-tight">Tytuł ogłoszenia</p>
                  <p className="mt-1 text-sm opacity-80">Treść ogłoszenia na ekranie budynku.</p>
                </div>
              );
            }}
          />
        )}
      />
    </div>
  );
}
