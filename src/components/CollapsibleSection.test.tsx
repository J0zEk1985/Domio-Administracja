import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CollapsibleSection } from "@/components/CollapsibleSection";

describe("CollapsibleSection", () => {
  it("hides content until the section name is clicked, then hides it again", () => {
    render(
      <CollapsibleSection title="Podstawowe">
        <p>Pełna nazwa prawna</p>
      </CollapsibleSection>,
    );

    expect(screen.queryByText("Pełna nazwa prawna")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Podstawowe" }));
    expect(screen.getByText("Pełna nazwa prawna")).toBeVisible();
    expect(screen.getByRole("button", { name: "Podstawowe" })).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "Podstawowe" }));
    expect(screen.getByText("Pełna nazwa prawna")).not.toBeVisible();
    expect(screen.getByRole("button", { name: "Podstawowe" })).toHaveAttribute("aria-expanded", "false");
  });
});
