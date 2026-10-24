import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signInAs } from "./support/keycloak";

// PLT-16: command palette in the top bar.
test("AC-1..AC-4, AC-7: secretary finds a page and a record from the top bar", async ({ page }) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.waitForLoadState("networkidle");

  // AC-1: the keyboard shortcut opens it.
  await page.keyboard.press("Control+k");
  const box = page.getByRole("combobox", { name: "Kërkim" });
  await expect(box).toBeFocused();

  // AC-2: menu page, without accents.
  await box.fill("student");
  const option = page.getByRole("option", { name: /Studentët/ }).first();
  await expect(option).toBeVisible();

  // AC-3/AC-4: a seeded program is found under its group.
  await box.fill("DEMO");
  await expect(page.getByText("Programe studimi")).toBeVisible();

  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);

  // AC-7: keyboard only: Enter opens the highlighted result.
  await box.fill("student");
  await expect(option).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/stu/);
});

test("AC-4: a student cannot find records of lists they may not read", async ({ page }) => {
  await signInAs(page, "student@dev.logos.test");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Hap kërkimin" }).click();
  const box = page.getByRole("combobox", { name: "Kërkim" });
  await box.fill("dev");
  await expect(page.getByRole("status")).toBeAttached();
  await page.waitForTimeout(800);
  for (const group of ["Përdorues", "Staf", "Aplikime", "Dokumente të lëshuara"])
    await expect(page.getByText(group, { exact: true })).toHaveCount(0);
});
