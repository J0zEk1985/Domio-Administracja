import { describe, expect, it } from "vitest";

import type { EBoardMessageListItem } from "@/hooks/useEBoardMessages";
import {
  applyEBoardMessageList,
  filterEBoardMessages,
  sortEBoardMessages,
} from "@/lib/eboardMessageList";

function row(
  overrides: Partial<EBoardMessageListItem> & Pick<EBoardMessageListItem, "id" | "title">,
): EBoardMessageListItem {
  return {
    org_id: "org-1",
    content: "",
    msg_type: "official",
    status: "published",
    community_id: "c1",
    location_id: null,
    valid_until: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    is_active: true,
    created_by: null,
    display_bg_color: null,
    display_text_color: null,
    display_from: null,
    display_until: null,
    communities: { name: "Nowe Polesie 3" },
    cleaning_locations: null,
    ...overrides,
  } as EBoardMessageListItem;
}

describe("filterEBoardMessages", () => {
  const rows = [
    row({
      id: "1",
      title: "Uwaga śliska podłoga",
      content: "Mokro przy wejściu",
      msg_type: "official",
    }),
    row({
      id: "2",
      title: "Brak ciepłej wody",
      content: "Awaria",
      msg_type: "resident",
      status: "pending_moderation",
      cleaning_locations: { name: "Blok A" },
    }),
  ];

  it("returns all rows for an empty query", () => {
    expect(filterEBoardMessages(rows, "  ")).toHaveLength(2);
  });

  it("matches title, type label, and building name", () => {
    expect(filterEBoardMessages(rows, "śliska").map((r) => r.id)).toEqual(["1"]);
    expect(filterEBoardMessages(rows, "mieszkaniec").map((r) => r.id)).toEqual(["2"]);
    expect(filterEBoardMessages(rows, "blok a").map((r) => r.id)).toEqual(["2"]);
  });
});

describe("sortEBoardMessages", () => {
  const rows = [
    row({
      id: "old",
      title: "Beta",
      created_at: "2026-01-01T00:00:00.000Z",
      valid_until: "2026-12-01T00:00:00.000Z",
      msg_type: "resident",
      status: "archived",
    }),
    row({
      id: "new",
      title: "Alfa",
      created_at: "2026-06-01T00:00:00.000Z",
      valid_until: "2026-03-01T00:00:00.000Z",
      msg_type: "official",
      status: "pending_moderation",
    }),
  ];

  it("sorts by created_desc by default order", () => {
    expect(sortEBoardMessages(rows, "created_desc").map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("sorts by title and valid_until", () => {
    expect(sortEBoardMessages(rows, "title_asc").map((r) => r.id)).toEqual(["new", "old"]);
    expect(sortEBoardMessages(rows, "valid_until_asc").map((r) => r.id)).toEqual(["new", "old"]);
  });
});

describe("applyEBoardMessageList", () => {
  it("filters then sorts", () => {
    const rows = [
      row({ id: "1", title: "Awaria windy", created_at: "2026-01-01T00:00:00.000Z" }),
      row({ id: "2", title: "Awaria wody", created_at: "2026-03-01T00:00:00.000Z" }),
      row({ id: "3", title: "Ogłoszenie", created_at: "2026-04-01T00:00:00.000Z" }),
    ];
    expect(applyEBoardMessageList(rows, "awaria", "created_desc").map((r) => r.id)).toEqual(["2", "1"]);
  });
});
