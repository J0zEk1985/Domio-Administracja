import { describe, expect, it } from "vitest";
import {
  filterCommunitiesByName,
  nextCommunityNameSort,
  sortCommunitiesByName,
} from "@/lib/communityList";

const rows = [
  { id: "1", name: "NOWE POLESIE 3" },
  { id: "2", name: "Alfa Park" },
  { id: "3", name: "Śródmieście" },
];

describe("filterCommunitiesByName", () => {
  it("returns a copy when query is empty", () => {
    const result = filterCommunitiesByName(rows, "  ");
    expect(result).toEqual(rows);
    expect(result).not.toBe(rows);
  });

  it("matches Polish case-insensitive substring", () => {
    expect(filterCommunitiesByName(rows, "polesie").map((r) => r.id)).toEqual(["1"]);
    expect(filterCommunitiesByName(rows, "ŚRÓD").map((r) => r.id)).toEqual(["3"]);
  });
});

describe("sortCommunitiesByName", () => {
  it("leaves order unchanged when sort is off", () => {
    expect(sortCommunitiesByName(rows, null).map((r) => r.id)).toEqual(["1", "2", "3"]);
  });

  it("sorts A–Z and Z–A with Polish collation", () => {
    expect(sortCommunitiesByName(rows, "asc").map((r) => r.id)).toEqual(["2", "1", "3"]);
    expect(sortCommunitiesByName(rows, "desc").map((r) => r.id)).toEqual(["3", "1", "2"]);
  });
});

describe("nextCommunityNameSort", () => {
  it("cycles none → asc → desc → none", () => {
    expect(nextCommunityNameSort(null)).toBe("asc");
    expect(nextCommunityNameSort("asc")).toBe("desc");
    expect(nextCommunityNameSort("desc")).toBe(null);
  });
});
