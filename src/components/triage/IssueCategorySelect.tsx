import { useEffect, useMemo, useState } from "react";

import type { TriageIssue } from "@/hooks/useTriageIssues";
import { useUpdateIssueCategory } from "@/hooks/useTriageIssueMutations";
import { ISSUE_CATEGORY_OPTIONS } from "@/lib/issueCategoryOptions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PREDEFINED_VALUES = new Set(ISSUE_CATEGORY_OPTIONS.map((o) => o.value));

export type IssueCategorySelectProps = {
  issue: TriageIssue;
  disabled?: boolean;
  className?: string;
};

export function IssueCategorySelect({ issue, disabled, className }: IssueCategorySelectProps) {
  const mut = useUpdateIssueCategory();
  const [value, setValue] = useState<string>(() => issue.category?.trim() || "");

  useEffect(() => {
    setValue(issue.category?.trim() || "");
  }, [issue.id, issue.category]);

  const busy = mut.isPending || disabled;

  const legacyOption = useMemo(() => {
    const c = issue.category?.trim();
    if (!c || PREDEFINED_VALUES.has(c)) return null;
    return { value: c, label: `${c} (z bazy)` };
  }, [issue.category]);

  return (
    <Select
      value={value || "__empty__"}
      disabled={busy}
      onValueChange={(v) => {
        const next = v === "__empty__" ? null : v;
        setValue(next ?? "");
        mut.mutate({ issueId: issue.id, category: next });
      }}
    >
      <SelectTrigger className={cn("h-8 w-[min(100%,14rem)] text-xs font-normal", className)}>
        <SelectValue placeholder="Wybierz kategorię" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__empty__" className="text-xs text-muted-foreground">
          — brak —
        </SelectItem>
        {legacyOption ? (
          <SelectItem key={legacyOption.value} value={legacyOption.value} className="text-xs">
            {legacyOption.label}
          </SelectItem>
        ) : null}
        {ISSUE_CATEGORY_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
