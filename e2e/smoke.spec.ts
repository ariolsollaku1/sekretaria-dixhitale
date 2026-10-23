import { expect, test } from "@playwright/test";

test("health endpoint reports app and database up", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ status: "ok", db: "ok" });
});

test("login page renders the sign-in button", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sekretari Dixhitale" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hyr" })).toBeVisible();
});
