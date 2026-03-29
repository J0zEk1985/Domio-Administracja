import { test, expect } from "@playwright/test";

test.describe("DOMIO Administracja", () => {
  test("tytuł dokumentu zawiera nazwę aplikacji", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/DOMIO Administracja/);
  });
});
