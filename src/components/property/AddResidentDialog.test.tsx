import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AddResidentDialog } from "@/components/property/AddResidentDialog";
import type { PropertyUnitRow } from "@/hooks/usePropertyResidents";

const mutate = vi.fn();

vi.mock("@/hooks/usePropertyResidents", () => ({
  useAddPropertyResident: () => ({ mutate, isPending: false }),
}));

const units: PropertyUnitRow[] = [
  {
    id: "u1",
    orgId: "o1",
    communityId: "c1",
    locationId: "l1",
    unitNumber: "12",
    normalizedUnitNumber: "12",
    kind: "residential",
    label: null,
  },
];

describe("AddResidentDialog", () => {
  it("submits occupant data through the import RPC wrapper", () => {
    render(
      <AddResidentDialog open onOpenChange={() => undefined} locationId="l1" units={units} />
    );

    fireEvent.change(screen.getByLabelText("Imię i nazwisko"), { target: { value: "Jan Kowalski" } });
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "jan@example.com" } });
    fireEvent.change(screen.getByLabelText("Lokal"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Dodaj" }));

    expect(mutate).toHaveBeenCalledWith(
      { email: "jan@example.com", fullName: "Jan Kowalski", unitNumber: "12" },
      expect.any(Object)
    );
  });

  it("shows that a missing unit will be created", () => {
    render(
      <AddResidentDialog open onOpenChange={() => undefined} locationId="l1" units={units} />
    );

    fireEvent.change(screen.getByLabelText("Imię i nazwisko"), { target: { value: "Anna Nowak" } });
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "anna@example.com" } });
    fireEvent.change(screen.getByLabelText("Lokal"), { target: { value: "7" } });

    expect(screen.getByText("Lokal 7 nie jest w rejestrze — zostanie utworzony.")).toBeTruthy();
  });
});
