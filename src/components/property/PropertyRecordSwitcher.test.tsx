import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { PropertyRecordSwitcher } from "@/components/property/PropertyRecordSwitcher";

const usePropertySwitcherOptions = vi.fn();

vi.mock("@/hooks/usePropertySwitcherOptions", () => ({
  usePropertySwitcherOptions: (enabled: boolean) => usePropertySwitcherOptions(enabled),
}));

const buildings = [
  { id: "p1", name: "", address: "Pienista 51, 94-109 Łódź, Polska" },
  { id: "p2", name: "Biurowiec", address: "Piotrkowska 1, Łódź" },
];

describe("PropertyRecordSwitcher", () => {
  beforeAll(() => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    Element.prototype.scrollIntoView = () => {};
  });

  it("loads building names only after the menu opens, then switches by id", () => {
    usePropertySwitcherOptions.mockImplementation((enabled: boolean) => ({
      data: enabled ? buildings : undefined,
      isFetching: false,
      isPending: false,
      isError: false,
    }));
    const onSwitch = vi.fn();

    render(
      <PropertyRecordSwitcher
        propertyId="p1"
        currentName="Pienista 51, 94-109 Łódź, Polska"
        onSwitch={onSwitch}
      />,
    );

    expect(usePropertySwitcherOptions).toHaveBeenCalledWith(false);
    expect(screen.queryByText("Biurowiec")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox", { name: /Przełącz budynek/ }));

    expect(usePropertySwitcherOptions).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByText("Biurowiec"));
    expect(onSwitch).toHaveBeenCalledWith("p2", "Biurowiec");
  });
});
