import { residentWarrantyPublicUrl } from "@/lib/residentWarrantyPublicUrl";

describe("residentWarrantyPublicUrl", () => {
  it("points production admin at the public Home page", () => {
    expect(residentWarrantyPublicUrl("316d472c-878a-4036-b06e-52c64346cfa7", "https://adm.domio.com.pl")).toBe(
      "https://home.domio.com.pl/usterki/316d472c-878a-4036-b06e-52c64346cfa7",
    );
  });

  it("points the test admin host at the test Home app", () => {
    expect(residentWarrantyPublicUrl("token", "https://test.adm.domio.com.pl")).toBe(
      "https://test.home.domio.com.pl/usterki/token",
    );
  });
});
