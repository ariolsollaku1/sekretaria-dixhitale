import { expect, test } from "@playwright/test";
import { signInAs } from "./support/keycloak";

test("AC-1..AC-5: finance reads the lecturer lists with filters and no identifiers; a student is refused", async ({
  page,
}) => {
  await signInAs(page, "finance@dev.logos.test");
  await page.goto("/hr/lists");
  await expect(page.getByRole("heading", { level: 1, name: "Listat e pedagogëve" })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "Lektor" });
  await expect(row).toContainText("PAE");
  await expect(row).toContainText("Dr.");
  // age is shown, birth date never
  await expect(row).toContainText(/4\d/);
  await expect(page.getByText("1985-03-15")).toHaveCount(0);

  // the seeded lecturer teaches DEMO101 in semester 1 of the current year
  await page.goto("/hr/lists?semester=1&program=DEMO-BSC");
  await expect(page.getByRole("row").filter({ hasText: "Lektor" })).toBeVisible();
  await page.goto("/hr/lists?semester=2");
  await expect(page.getByRole("row").filter({ hasText: "Lektor" })).toHaveCount(0);
  // age range
  await page.goto("/hr/lists?ageFrom=70");
  await expect(page.getByRole("row").filter({ hasText: "Lektor" })).toHaveCount(0);
  await page.goto("/hr/lists?ageFrom=30&ageTo=60&gender=FEMALE");
  await expect(page.getByRole("row").filter({ hasText: "Lektor" })).toBeVisible();
  // preset link
  await page.goto("/hr/lists");
  await page.getByRole("link", { name: "Vullnetarë" }).click();
  await expect(page).toHaveURL(/category=VOLUNTEER/);

  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/hr/lists");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
