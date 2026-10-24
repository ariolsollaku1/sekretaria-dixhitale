import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

// Remove the fees and plans the test creates; nothing else uses them yet.
async function cleanup() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("delete from plan_installments");
    await client.query("delete from payment_plans");
    await client.query("delete from fee_discounts");
    await client.query("delete from fee_installment_templates");
    await client.query("delete from fee_schedule_items");
  } finally {
    await client.end();
  }
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

async function signInFresh(page: Page, email: string) {
  await page.context().clearCookies();
  await signInAs(page, email);
}

test("AC-1..AC-3, 6, 8, 9: Finance sets a fee with installments and a discount, generates the plan and adjusts an installment", async ({
  page,
}) => {
  await signInAs(page, "finance@dev.logos.test");
  await page.goto("/fin/fees?program=DEMO-BSC");
  await page.waitForLoadState("networkidle");

  // --- a fee whose installments do not add up is refused
  await page.getByRole("button", { name: "Shto një tarifë" }).click();
  await page.getByLabel("Shuma", { exact: true }).fill("1000");
  await page.getByRole("button", { name: "Shto një këst" }).click();
  await page.getByRole("button", { name: "Shto një këst" }).click();
  await page.getByLabel("Afati").nth(0).fill("2026-10-01");
  await page.getByLabel("Shuma e kestit").nth(0).fill("600");
  await page.getByLabel("Afati").nth(1).fill("2027-02-01");
  await page.getByLabel("Shuma e kestit").nth(1).fill("300");
  await page.getByRole("button", { name: "Shto një zbritje" }).click();
  await page.getByLabel("Vlera").fill("10");
  await page.getByLabel("Nga").fill("2026-08-01");
  await page.getByLabel("Deri").fill("2026-09-15");
  await page.getByRole("button", { name: "Ruaj", exact: true }).click();
  await expect(page.getByText("Këstet duhet të përbëjnë saktësisht tarifën.")).toBeVisible();

  // --- fixed and saved
  await page.getByLabel("Shuma e kestit").nth(1).fill("400");
  await page.getByRole("button", { name: "Ruaj", exact: true }).click();
  await expect(page.getByText("Tarifa u ruajt.")).toBeVisible();
  await page.waitForSelector("[data-sonner-toast]", { state: "detached" });
  await expect(page.getByRole("cell", { name: "1 000.00" })).toBeVisible();
  await expect(page.getByText("2026-10-01 — 600.00")).toBeVisible();

  // --- the plans of the program
  await page.goto("/fin/plans");
  await page.waitForLoadState("networkidle");
  const demo = await page
    .locator("#gen-program option", { hasText: "DEMO-BSC" })
    .first()
    .getAttribute("value");
  await page.locator("#gen-program").selectOption(demo!);
  await page.getByRole("button", { name: "Gjenero" }).click();
  await expect(page.getByText(/Plane të krijuara: \d+/)).toBeVisible();
  await page.waitForSelector("[data-sonner-toast]", { state: "detached" });
  await page
    .getByRole("link", { name: /^\d{6}$/ })
    .first()
    .click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Totali i planit")).toBeVisible();
  await expect(page.getByText("1 000.00").first()).toBeVisible();
  await expect(page.getByText("540.00 deri më 2026-09-15")).toBeVisible();

  // --- an installment is adjusted with a reason
  await page.getByRole("button", { name: "Ndrysho" }).first().click();
  await page.getByLabel("Shuma", { exact: true }).fill("550");
  await page.getByLabel("Arsyeja").fill("E2E hardship");
  await page.getByRole("button", { name: "Ruaj", exact: true }).click();
  await expect(page.getByText("U ruajt.")).toBeVisible();
  await page.waitForSelector("[data-sonner-toast]", { state: "detached" });
  await expect(page.getByText("Ndryshuar")).toBeVisible();
  await expect(page.getByText("950.00").first()).toBeVisible();

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );
});

test("AC-11: the Secretariat reads but cannot change, and a lecturer is refused", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/fin/fees?program=DEMO-BSC");
  await expect(page.getByRole("heading", { level: 1, name: "Tarifat" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Shto një tarifë" })).toHaveCount(0);
  await page.goto("/fin/plans");
  await expect(page.getByRole("heading", { level: 1, name: "Planet e pagesave" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gjenero" })).toHaveCount(0);

  await signInFresh(page, "lecturer@dev.logos.test");
  await page.goto("/fin/fees");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  await page.goto("/fin/plans");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
