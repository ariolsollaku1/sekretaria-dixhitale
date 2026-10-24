import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signInAs } from "./support/keycloak";

// Read-only feature: the test creates no rows.

test("AC-1..AC-7: a lecturer opens the workspace from the dashboard, sees courses and the roster; others are refused", async ({
  page,
}) => {
  await signInAs(page, "lecturer@dev.logos.test");
  // the dashboard card leads to the hub
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Mësimdhënia ime" })).toBeVisible();
  await page.getByRole("link", { name: "Hap hapësirën time" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Mësimdhënia ime" })).toBeVisible();
  const assignments = page.getByTestId("assignments");
  await expect(assignments.getByText(/DEMO101/)).toBeVisible();
  const shortcuts = page.getByRole("region", { name: "Shkurtore" });
  await expect(shortcuts.getByRole("link", { name: "Orari im" })).toBeVisible();
  await expect(page.getByTestId("unread")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);

  // the roster of the assignment lists the demo student
  await assignments.getByRole("link", { name: "Lista" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Lista e studentëve" })).toBeVisible();
  await expect(page.getByTestId("roster").getByText("Demo")).toBeVisible();

  // an assignment that is not the lecturer's own is not found
  await page.goto("/hr/teaching/not-mine");
  await expect(page.getByRole("heading", { level: 1, name: "Faqja nuk u gjet" })).toBeVisible();

  // forbidden: students and the Secretariat have no lecturer workspace
  for (const email of ["student@dev.logos.test", "secretary@dev.logos.test"]) {
    await page.context().clearCookies();
    await signInAs(page, email);
    await page.goto("/hr/teaching");
    await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  }
});
