import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommunityOrderCatalogItemDialog } from "@/components/communities/CommunityOrderCatalogItemDialog";
import {
  RESIDENT_ORDER_FACTORY_BODY,
  RESIDENT_ORDER_FACTORY_SUBJECT,
} from "@/lib/residentOrderTemplateTokens";
import type { ResidentOrderCatalogItem } from "@/types/residentOrders";

vi.mock("@/components/companies/CompanyComboBox", () => ({
  CompanyComboBox: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange("company-1")}>
      Wybierz firmę
    </button>
  ),
}));

const item: ResidentOrderCatalogItem = {
  id: "item-1",
  orgId: "org-1",
  communityId: "community-1",
  name: "Brelok do domofonu",
  description: null,
  priceAmount: 15,
  priceKind: "exact",
  imageUrl: null,
  isActive: true,
  sortOrder: 0,
  locationIds: [],
  companyId: "company-1",
  companyName: "Serwis",
  emailSubjectTemplate: RESIDENT_ORDER_FACTORY_SUBJECT,
  emailBodyTemplate: RESIDENT_ORDER_FACTORY_BODY,
  createdAt: "2026-09-29T00:00:00Z",
  updatedAt: "2026-09-29T00:00:00Z",
};

describe("CommunityOrderCatalogItemDialog", () => {
  beforeEach(() => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  it("shows Polish field names and hides the technical token list", () => {
    render(
      <CommunityOrderCatalogItemDialog
        open
        item={item}
        buildings={[]}
        pending={false}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Temat wiadomości")).toHaveValue(
      "[DOMIO #numer_zamowienia] Zamówienie: #nazwa_pozycji — #adres_budynku, lokal #numer_lokalu",
    );
    const body = screen.getByLabelText("Treść wiadomości") as HTMLTextAreaElement;
    expect(body.value).toContain("#nazwa_firmy");
    expect(body.value).not.toContain("{{");
    expect(screen.getByText("Pola do wstawienia")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /#nazwa_firmy/ })).toHaveTextContent("nazwa firmy, która wysyła zamówienie");
    expect(screen.queryByRole("button", { name: /#nip_firmy/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/\{\{org\.name\}\}/)).not.toBeInTheDocument();
  });

  it("inserts a field at the cursor and submits the technical form", () => {
    const onSubmit = vi.fn();
    render(
      <CommunityOrderCatalogItemDialog
        open
        item={item}
        buildings={[]}
        pending={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const body = screen.getByLabelText("Treść wiadomości") as HTMLTextAreaElement;
    fireEvent.focus(body);
    body.setSelectionRange(body.value.length, body.value.length);

    fireEvent.click(screen.getByRole("button", { name: "Wstaw prosty szablon" }));
    expect(body.value).toContain("prosimy o realizację zamówienia");

    body.setSelectionRange(0, 0);
    fireEvent.click(screen.getByRole("button", { name: /^#cena\b/ }));
    expect(body.value.startsWith("#cena ")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Wybierz firmę" }));
    fireEvent.click(screen.getByRole("button", { name: "Zapisz" }));

    const saved = onSubmit.mock.calls[0]?.[0] as {
      companyId: string;
      emailSubjectTemplate: string;
      emailBodyTemplate: string;
    };
    expect(saved.companyId).toBe("company-1");
    expect(saved.emailSubjectTemplate).toContain("{{item.name}}");
    expect(saved.emailSubjectTemplate).not.toContain("#");
    expect(saved.emailBodyTemplate).toContain("{{org.name}}");
    expect(saved.emailBodyTemplate).not.toContain("#");
    expect(saved.emailBodyTemplate).not.toContain("{{org.nip}}");
  });
});
