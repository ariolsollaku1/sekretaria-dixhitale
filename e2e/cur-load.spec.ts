import { expect, test } from "@playwright/test";
import { signInAs } from "./support/keycloak";

test("AC-1/2/4: the load report shows the seeded lecturer; a student is refused", async ({
  page,
}) => {
  await signInAs(page, "hr@dev.logos.test");
  await page.goto("/cur/teaching/load");
  await expect(
    page.getByRole("heading", { level: 1, name: "Ngarkesa mësimore vjetore" }),
  ).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "Lektor" });
  await expect(row).toContainText("PAE");
  await expect(row.getByRole("cell").last()).toHaveText("30");
  await page.goto("/cur/teaching/load?semester=2");
  await expect(page.getByRole("row").filter({ hasText: "Lektor" })).toHaveCount(0);

  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/cur/teaching/load");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
