import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DeveloperAccessCard } from "@/components/communities/DeveloperAccessCard";
import type { DeveloperAccess } from "@/types/developer-warranty";

const restoreMutateAsync = vi.fn();
const deleteMutateAsync = vi.fn();
const deactivateMutateAsync = vi.fn();

vi.mock("@/hooks/useDeveloperWarranty", () => ({
  useRestoreDeveloperAccess: () => ({ mutateAsync: restoreMutateAsync, isPending: false }),
  useDeleteDeveloperAccess: () => ({ mutateAsync: deleteMutateAsync, isPending: false }),
  useDeactivateDeveloperAccess: () => ({ mutateAsync: deactivateMutateAsync, isPending: false }),
}));

vi.mock("@/components/communities/CreateDeveloperAccessDialog", () => ({
  CreateDeveloperAccessDialog: () => null,
}));

const deactivatedAccess: DeveloperAccess = {
  id: "access-1",
  community_id: "community-1",
  org_id: "org-1",
  developer_email: "aplikacjandomio@gmail.com",
  developer_name: "Archicom",
  activation_token: "token",
  activation_token_expires_at: null,
  activated_at: "2026-10-01T10:00:00.000Z",
  pin_hash: "hash",
  access_token: "portal-token",
  created_at: "2026-10-01T09:00:00.000Z",
  created_by: null,
  deactivated_at: "2026-10-07T08:00:00.000Z",
  deactivated_by: null,
  last_login_at: null,
};

function renderCard(access: DeveloperAccess | null, canManage = true) {
  return render(
    <DeveloperAccessCard
      communityId="community-1"
      communityName="Wspólnota Test"
      canManage={canManage}
      developerAccess={access}
    />,
  );
}

describe("DeveloperAccessCard", () => {
  it("offers restore and permanent removal for a deactivated developer", () => {
    renderCard(deactivatedAccess);

    expect(screen.getByText("Dezaktywowany")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Przywróć dostęp" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usuń dostęp" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dodaj dewelopera" })).not.toBeInTheDocument();
  });

  it("confirms that warranty issues stay when access is removed", () => {
    renderCard(deactivatedAccess);

    fireEvent.click(screen.getByRole("button", { name: "Usuń dostęp" }));

    expect(
      screen.getByText(/Usterki, komentarze i historia zdarzeń tej Wspólnoty pozostaną w systemie/),
    ).toBeInTheDocument();
  });

  it("restores the same developer access", () => {
    restoreMutateAsync.mockResolvedValue({ communityId: "community-1" });
    renderCard(deactivatedAccess);

    fireEvent.click(screen.getByRole("button", { name: "Przywróć dostęp" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Przywróć dostęp" }));

    expect(restoreMutateAsync).toHaveBeenCalledWith({
      accessId: "access-1",
      communityId: "community-1",
    });
  });

  it("shows add developer only when no access record exists", () => {
    renderCard(null);

    expect(screen.getByRole("button", { name: "Dodaj dewelopera" })).toBeInTheDocument();
  });
});
