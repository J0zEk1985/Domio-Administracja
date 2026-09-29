import { describe, expect, it } from "vitest";
import { parseBoardPortalCommentInsert, parseBoardPortalSnapshot } from "@/lib/boardPortalSnapshot";

describe("parseBoardPortalSnapshot", () => {
  it("keeps only parsed board-visible tasks with comments", () => {
    const result = parseBoardPortalSnapshot({
      ok: true,
      property: { name: "Wspólnota", address: null, community_name: "Wspólnota" },
      issues: [],
      announcements: [],
      contacts: [],
      tasks: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          title: "montaż oświetlenia w pergolach",
          status: "todo",
          priority: "low",
          created_at: "2026-09-29T17:39:00+00:00",
          location_name: null,
          comments: [
            {
              id: "22222222-2222-2222-2222-222222222222",
              content: "Zlecone Darkowi",
              created_at: "2026-09-29T17:39:00+00:00",
              source: "staff",
              author_name: "Marcin Józefiak",
            },
          ],
        },
        {
          id: "bad",
          title: "internal should still parse if present",
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.title).toBe("montaż oświetlenia w pergolach");
    expect(result.tasks[0]?.comments).toEqual([
      {
        id: "22222222-2222-2222-2222-222222222222",
        content: "Zlecone Darkowi",
        created_at: "2026-09-29T17:39:00+00:00",
        source: "staff",
        author_name: "Marcin Józefiak",
      },
    ]);
  });

  it("labels board comments as Zarząd when author_name is missing", () => {
    const result = parseBoardPortalSnapshot({
      ok: true,
      property: { name: "X", address: null, community_name: null },
      issues: [],
      announcements: [],
      contacts: [],
      tasks: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          title: "Zadanie",
          status: "in_progress",
          priority: "medium",
          created_at: "2026-09-29T17:39:00+00:00",
          comments: [
            {
              id: "33333333-3333-3333-3333-333333333333",
              content: "Prosimy o termin",
              created_at: "2026-09-29T18:00:00+00:00",
              source: "board",
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tasks[0]?.comments[0]?.source).toBe("board");
    expect(result.tasks[0]?.comments[0]?.author_name).toBe("Zarząd");
  });
});

describe("parseBoardPortalCommentInsert", () => {
  it("reads the inserted board comment", () => {
    const comment = parseBoardPortalCommentInsert({
      ok: true,
      comment: {
        id: "44444444-4444-4444-4444-444444444444",
        content: "OK",
        created_at: "2026-09-29T18:10:00+00:00",
        source: "board",
        author_name: "Zarząd",
      },
    });
    expect(comment?.content).toBe("OK");
    expect(comment?.source).toBe("board");
  });

  it("returns null on error payload", () => {
    expect(parseBoardPortalCommentInsert({ ok: false, error: "empty_content" })).toBeNull();
  });
});
