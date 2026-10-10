import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PropertySosModuleCard } from "@/components/property/PropertySosModuleCard";

const save = vi.fn();

vi.mock("@/hooks/useBuildingSosModule", () => ({
  useBuildingSosModule: () => ({
    enabled: false,
    isLoading: false,
    isError: false,
    isSaving: false,
    save,
  }),
}));

describe("PropertySosModuleCard", () => {
  it("saves the SOS module when an administrator turns it on", () => {
    save.mockClear();

    render(<PropertySosModuleCard locationId="loc-1" orgId="org-1" canManage />);

    expect(screen.getByText("Moduł SOS")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Włącz moduł SOS na tym budynku" }));

    expect(save).toHaveBeenCalledWith(true);
  });
});
