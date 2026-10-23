import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signInAs } from "./support/keycloak";

test("AC-7/9/10: a sysadmin sees the nightly clean-up queue with its schedule; a secretary is refused", async ({
  page,
}) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.getByRole("link", { name: "Punët në sfond" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Punët në sfond" })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "plt.files.cleanup-orphans" }).first();
  await expect(row).toContainText("0 3 * * *");

  // filters keep working with no jobs in a state
  await page.getByLabel("Gjendja").selectOption("failed");
  await page.getByRole("button", { name: "Filtro" }).click();
  await expect(page).toHaveURL(/state=failed/);
  await expect(page.getByRole("heading", { level: 1, name: "Punët në sfond" })).toBeVisible();

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} ${v.nodes[0]?.target}`),
  ).toEqual([]);

  await page.context().clearCookies();
  await signInAs(page, "secretary@dev.logos.test");
  await expect(page.getByRole("link", { name: "Punët në sfond" })).toHaveCount(0);
  await page.goto("/admin/jobs");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
