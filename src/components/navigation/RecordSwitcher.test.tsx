import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { RecordSwitcher } from "@/components/navigation/RecordSwitcher";

const items = [
  { id: "a", label: "Nowe Polesie 3", hint: "5482664711" },
  { id: "b", label: "Stare Polesie", hint: "Nieaktywna" },
];

function renderSwitcher(onSelect = vi.fn(), onOpenChange = vi.fn()) {
  render(
    <RecordSwitcher
      currentId="a"
      currentLabel="Nowe Polesie 3"
      items={items}
      open
      onOpenChange={onOpenChange}
      onSelect={onSelect}
      isLoading={false}
      isError={false}
      ariaLabel="Przełącz wspólnotę"
      searchPlaceholder="Szukaj wspólnoty…"
      emptyText="Brak wspólnot."
      errorText="Nie udało się wczytać listy wspólnot."
    />,
  );
  return { onSelect, onOpenChange };
}

describe("RecordSwitcher", () => {
  beforeAll(() => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    Element.prototype.scrollIntoView = () => {};
  });

  it("shows the current record as the menu trigger", () => {
    renderSwitcher();
    expect(screen.getByRole("combobox", { name: "Przełącz wspólnotę, obecnie Nowe Polesie 3" })).toBeInTheDocument();
  });

  it("lists records and reports the chosen id", () => {
    const { onSelect } = renderSwitcher();

    expect(screen.getByText("Stare Polesie")).toBeInTheDocument();
    expect(screen.getByText("Nieaktywna")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Stare Polesie"));
    expect(onSelect).toHaveBeenCalledWith("b");
  });
});
