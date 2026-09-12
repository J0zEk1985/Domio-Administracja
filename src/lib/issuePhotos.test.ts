import { describe, expect, it } from "vitest";

import { appendIssuePhotos, isImageFile, MAX_ISSUE_PHOTOS } from "@/lib/issuePhotos";

function fakeFile(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe("isImageFile", () => {
  it("accepts image MIME types", () => {
    expect(isImageFile(fakeFile("a.jpg", "image/jpeg"))).toBe(true);
    expect(isImageFile(fakeFile("a.png", "image/png"))).toBe(true);
  });

  it("accepts empty MIME when the extension is an image", () => {
    expect(isImageFile(fakeFile("photo.heic", ""))).toBe(true);
  });

  it("rejects non-images", () => {
    expect(isImageFile(fakeFile("notes.pdf", "application/pdf"))).toBe(false);
  });
});

describe("appendIssuePhotos", () => {
  it("appends up to the max and reports overflow", () => {
    const current = [fakeFile("a.jpg", "image/jpeg")];
    const incoming = [
      fakeFile("b.jpg", "image/jpeg"),
      fakeFile("c.jpg", "image/jpeg"),
      fakeFile("d.jpg", "image/jpeg"),
      fakeFile("e.jpg", "image/jpeg"),
      fakeFile("f.jpg", "image/jpeg"),
    ];
    const result = appendIssuePhotos(current, incoming, MAX_ISSUE_PHOTOS);
    expect(result.files).toHaveLength(MAX_ISSUE_PHOTOS);
    expect(result.overflow).toBe(1);
    expect(result.skippedNonImage).toBe(0);
  });

  it("skips non-image files", () => {
    const result = appendIssuePhotos([], [fakeFile("a.jpg", "image/jpeg"), fakeFile("x.pdf", "application/pdf")]);
    expect(result.files).toHaveLength(1);
    expect(result.skippedNonImage).toBe(1);
  });
});
