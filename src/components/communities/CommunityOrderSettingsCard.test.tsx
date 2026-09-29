import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommunityOrderSettingsCard } from "@/components/communities/CommunityOrderSettingsCard";
import {
  RESIDENT_ORDER_FACTORY_BODY,
  RESIDENT_ORDER_FACTORY_SUBJECT,
} from "@/lib/residentOrderTemplateTokens";

const mutate = vi.hoisted(() => vi.fn());
const settings = vi.hoisted(() => ({
  communityId: "community-1",
  orgId: "org-1",
  defaultCompanyId: null as string | null,
  emailSubjectTemplate: "",
  emailBodyTemplate: "",
  updatedAt: "2026-09-29T00:00:00Z",
  updatedBy: null as string | null,
}));

vi.mock("@/hooks/useResidentOrders", () => ({
  useResidentOrderSettings: () => ({
    isLoading: false,
    isError: false,
    data: settings,
  }),
  useSaveResidentOrderSettings: () => ({
    isPending: false,
    mutate,
  }),
}));

vi.mock("@/components/companies/CompanyComboBox", () => ({
  CompanyComboBox: () => <div>Wybór firmy</div>,
}));

describe("CommunityOrderSettingsCard", () => {
  beforeEach(() => {
    settings.emailSubjectTemplate = RESIDENT_ORDER_FACTORY_SUBJECT;
    settings.emailBodyTemplate = RESIDENT_ORDER_FACTORY_BODY;
  });

  it("shows Polish field names and hides the technical token list", () => {
    render(<CommunityOrderSettingsCard communityId="community-1" />);

    expect(screen.getByLabelText("Temat wiadomości")).toHaveValue(
      "Zamówienie: #nazwa_pozycji — #adres_budynku, lokal #numer_lokalu",
    );
    const body = screen.getByLabelText("Treść wiadomości") as HTMLTextAreaElement;
    expect(body.value).toContain("#nazwa_firmy");
    expect(body.value).not.toContain("{{");
    expect(screen.getByText("Pola do wstawienia")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /#nazwa_firmy/ })).toHaveTextContent("nazwa firmy, która wysyła zamówienie");
    expect(screen.queryByRole("button", { name: /#nip_firmy/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/\{\{org\.name\}\}/)).not.toBeInTheDocument();
  });

  it("inserts a field at the cursor and saves the technical form", () => {
    mutate.mockClear();
    render(<CommunityOrderSettingsCard communityId="community-1" />);

    const body = screen.getByLabelText("Treść wiadomości") as HTMLTextAreaElement;
    fireEvent.focus(body);
    body.setSelectionRange(body.value.length, body.value.length);

    fireEvent.click(screen.getByRole("button", { name: "Wstaw prosty szablon" }));
    expect(body.value).toContain("prosimy o realizację zamówienia");

    body.setSelectionRange(0, 0);
    fireEvent.click(screen.getByRole("button", { name: /^#cena\b/ }));
    expect(body.value.startsWith("#cena ")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Zapisz ustawienia" }));

    const saved = mutate.mock.calls[0]?.[0] as { emailSubjectTemplate: string; emailBodyTemplate: string };
    expect(saved.emailSubjectTemplate).toContain("{{item.name}}");
    expect(saved.emailSubjectTemplate).not.toContain("#");
    expect(saved.emailBodyTemplate).toContain("{{org.name}}");
    expect(saved.emailBodyTemplate).not.toContain("#");
    expect(saved.emailBodyTemplate).not.toContain("{{org.nip}}");
  });
});
