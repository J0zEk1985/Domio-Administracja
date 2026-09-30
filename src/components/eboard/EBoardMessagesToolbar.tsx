import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EBOARD_SORT_KEYS, EBOARD_SORT_LABELS, type EBoardSortKey } from "@/lib/eboardMessageList";

type EBoardMessagesToolbarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  sortKey: EBoardSortKey;
  onSortKeyChange: (value: EBoardSortKey) => void;
};

export function EBoardMessagesToolbar({
  query,
  onQueryChange,
  sortKey,
  onSortKeyChange,
}: EBoardMessagesToolbarProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Szukaj po tytule, typie lub zasięgu…"
          className="h-9 pl-9"
          aria-label="Szukaj ogłoszeń"
        />
      </div>
      <Select value={sortKey} onValueChange={(v) => onSortKeyChange(v as EBoardSortKey)}>
        <SelectTrigger className="h-9 w-full sm:w-[13.5rem]" aria-label="Sortuj ogłoszenia">
          <SelectValue placeholder="Sortuj" />
        </SelectTrigger>
        <SelectContent>
          {EBOARD_SORT_KEYS.map((key) => (
            <SelectItem key={key} value={key}>
              {EBOARD_SORT_LABELS[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
