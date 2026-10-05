import { describe, expect, it } from "vitest";

import { ecosystemCopySourceLabel, ecosystemCopySources, type EcosystemCopyCandidate } from "@/lib/ecosystemCopySources";

function row(partial: Partial<EcosystemCopyCandidate> & Pick<EcosystemCopyCandidate, "id" | "locationMasterId">): EcosystemCopyCandidate {
  return {
    name: "—",
    address: "Adres",
    communityId: "community-a",
    communityName: "Wspólnota A",
    ...partial,
  };
}

describe("ecosystemCopySources", () => {
  it("keeps buildings from a different community and drops the current address", () => {
    const sources = ecosystemCopySources(
      [
        row({
          id: "current",
          locationMasterId: "master-current",
          address: "Bieżący 1",
          communityId: "community-a",
          communityName: "Wspólnota A",
        }),
        row({
          id: "same-community",
          locationMasterId: "master-same",
          address: "Sąsiedni 2",
          communityId: "community-a",
          communityName: "Wspólnota A",
        }),
        row({
          id: "other-community",
          locationMasterId: "master-other",
          address: "Obcy 3",
          communityId: "community-b",
          communityName: "Wspólnota B",
        }),
        row({
          id: "no-master",
          locationMasterId: null,
          address: "Bez adresu",
          communityId: "community-b",
          communityName: "Wspólnota B",
        }),
      ],
      "master-current",
    );

    expect(sources.map((item) => item.id)).toEqual(["other-community", "same-community"]);
  });

  it("dedupes two rows that share one physical address", () => {
    const sources = ecosystemCopySources(
      [
        row({ id: "first", locationMasterId: "master-1", address: "Ten sam 1" }),
        row({ id: "second", locationMasterId: "master-1", address: "Ten sam 1", name: "Klatka" }),
      ],
      "master-current",
    );

    expect(sources).toHaveLength(1);
    expect(sources[0]?.id).toBe("first");
  });
});

describe("ecosystemCopySourceLabel", () => {
  it("shows the community so a building outside the current one stays recognizable", () => {
    expect(
      ecosystemCopySourceLabel(
        row({
          id: "b",
          locationMasterId: "master-b",
          name: "—",
          address: "ul. Polna 4",
          communityName: "Wspólnota Polna",
        }),
      ),
    ).toBe("ul. Polna 4 · Wspólnota Polna");
  });
});
