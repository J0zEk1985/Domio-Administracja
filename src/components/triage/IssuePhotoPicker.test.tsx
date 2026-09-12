import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IssuePhotoPicker } from "@/components/triage/IssuePhotoPicker";

vi.mock("@/lib/issuePhotos", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/issuePhotos")>();
  return {
    ...actual,
    compressIssuePhotos: async (files: File[]) => files,
  };
});

function PickerHarness() {
  const [files, setFiles] = useState<File[]>([]);
  return <IssuePhotoPicker files={files} onChange={setFiles} />;
}

describe("IssuePhotoPicker", () => {
  it("shows camera and gallery actions", () => {
    render(<PickerHarness />);
    expect(screen.getByRole("button", { name: "Zrób zdjęcie" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dodaj z galerii" })).toBeInTheDocument();
    expect(screen.getByText(/Możesz zrobić zdjęcie lub wybrać z galerii/)).toBeInTheDocument();
  });

  it("adds a thumbnail and allows preview plus remove", async () => {
    render(<PickerHarness />);
    const file = new File([new Uint8Array([1, 2, 3])], "usterka.jpg", { type: "image/jpeg" });
    const gallery = document.querySelector<HTMLInputElement>('input[type="file"]:not([capture])');
    expect(gallery).toBeTruthy();
    fireEvent.change(gallery!, { target: { files: [file] } });

    const thumb = await screen.findByRole("button", { name: "Podgląd zdjęcia 1" });
    expect(thumb).toBeInTheDocument();
    expect(screen.getByText("1/5")).toBeInTheDocument();

    fireEvent.click(thumb);
    await waitFor(() => {
      expect(screen.getByText("Podgląd zdjęcia")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(screen.queryByText("Podgląd zdjęcia")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Usuń zdjęcie 1" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Podgląd zdjęcia 1" })).not.toBeInTheDocument();
    });
  });
});
