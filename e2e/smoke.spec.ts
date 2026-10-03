import { expect, test } from "@playwright/test";

test("home page renders the placeholder heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sekretari Dixhitale" })).toBeVisible();
});
