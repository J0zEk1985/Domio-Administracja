import { describe, expect, it } from "vitest";
import { warrantyPhotoObjectPath } from "@/lib/warrantyPhotos";

describe("warrantyPhotoObjectPath", () => {
  it("reads the object path after the bucket name", () => {
    expect(
      warrantyPhotoObjectPath(
        "https://example.supabase.co/storage/v1/object/public/warranty-photos/warranty-issues/123-abc.jpg",
      ),
    ).toBe("warranty-issues/123-abc.jpg");
  });

  it("drops a signed query string", () => {
    expect(
      warrantyPhotoObjectPath(
        "https://example.supabase.co/storage/v1/object/sign/warranty-photos/warranty-issues/a%20b.jpg?token=secret",
      ),
    ).toBe("warranty-issues/a b.jpg");
  });

  it("rejects a path that leaves the bucket", () => {
    expect(
      warrantyPhotoObjectPath(
        "https://example.supabase.co/storage/v1/object/public/warranty-photos/../other/a.jpg",
      ),
    ).toBeNull();
  });
});
