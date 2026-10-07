import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { CommunityRecordSwitcher } from "@/components/communities/CommunityRecordSwitcher";

const useCommunities = vi.fn();

vi.mock("@/hooks/useCommunities", () => ({
  useCommunities: (orgId: string | null, options?: { enabled?: boolean }) => useCommunities(orgId, options),
}));

const communities = [
  { id: "a", name: "Nowe Polesie 3", status: "active", nip: "5482664711" },
  { id: "b", name: "Stare Polesie", status: "inactive", nip: null },
];

describe("CommunityRecordSwitcher", () => {
  beforeAll(() => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    Element.prototype.scrollIntoView = () => {};
  });

  it("loads the community list only after the menu opens, then switches by id", () => {
    useCommunities.mockImplementation((_orgId: string | null, options?: { enabled?: boolean }) => ({
      data: options?.enabled ? communities : undefined,
      isFetching: false,
      isPending: false,
      isError: false,
    }));
    const onSwitch = vi.fn();

    render(
      <CommunityRecordSwitcher
        orgId="org-1"
        communityId="a"
        currentName="Nowe Polesie 3"
        onSwitch={onSwitch}
      />,
    );

    expect(useCommunities).toHaveBeenCalledWith("org-1", expect.objectContaining({ enabled: false }));
    expect(screen.queryByText("Stare Polesie")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox", { name: /Przełącz wspólnotę/ }));

    expect(useCommunities).toHaveBeenCalledWith("org-1", expect.objectContaining({ enabled: true }));
    fireEvent.click(screen.getByText("Stare Polesie"));
    expect(onSwitch).toHaveBeenCalledWith("b", "Stare Polesie");
  });
});
