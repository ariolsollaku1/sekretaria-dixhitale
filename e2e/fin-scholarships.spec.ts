import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

// Remove the fees, plans and scholarships the test creates; nothing else uses them yet.
async function cleanup() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("delete from scholarship_cuts");
    await client.query("delete from scholarships");
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

test("AC-2, AC-4, AC-9, AC-10: Finance grants a partial scholarship, the plan is recalculated, the list and report show it", async ({
  page,
}) => {
  await signInAs(page, "finance@dev.logos.test");

  // --- a tuition fee of 1000 in one installment and the plans of the program
  await page.goto("/fin/fees?program=DEMO-BSC");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Shto një tarifë" }).click();
  await page.getByLabel("Shuma", { exact: true }).fill("1000");
  await page.getByRole("button", { name: "Ruaj", exact: true }).click();
  await expect(page.getByText("Tarifa u ruajt.")).toBeVisible();
  await page.waitForSelector("[data-sonner-toast]", { state: "detached" });

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
  const number = (
    await page
      .getByRole("link", { name: /^\d{6}$/ })
      .first()
      .innerText()
  ).trim();

  // --- grant 50 % directly
  await page.goto("/fin/scholarships");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Bursat" })).toBeVisible();
  await page.locator("#gs-direct-student").fill(number);
  await page.locator("#gs-direct-how").selectOption("PERCENT");
  await page.locator("#gs-direct-value").fill("50");
  await page.locator("#gs-direct-reason").fill("E2E need");
  await page.getByRole("button", { name: "Jep bursën" }).click();
  await expect(
    page.getByText("Bursa u regjistrua dhe plani i pagesave u rillogarit."),
  ).toBeVisible();
  await page.waitForSelector("[data-sonner-toast]", { state: "detached" });

  // --- a second grant for the same student and year is refused
  await page.locator("#gs-direct-student").fill(number);
  await page.locator("#gs-direct-how").selectOption("FULL");
  await page.locator("#gs-direct-reason").fill("E2E again");
  await page.getByRole("button", { name: "Jep bursën" }).click();
  await expect(page.getByText("Ky regjistrim ka tashmë një bursë për këtë vit.")).toBeVisible();

  // --- the list shows the fee before, the reduction and after
  await page.reload();
  await page.waitForLoadState("networkidle");
  const row = page.getByRole("row", { name: new RegExp(number) });
  await expect(row).toContainText("50.00 %");
  await expect(row).toContainText("1 000.00");
  await expect(row).toContainText("500.00");

  // --- the report counts it
  await page.goto("/fin/scholarships/report");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("row", { name: /DEMO-BSC/ })).toContainText("1");

  // --- the plan was recalculated
  await page.goto("/fin/scholarships");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: number }).click();
  await page.waitForURL(/\/fin\/plans\//);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Totali i planit")).toBeVisible();
  await expect(page.getByText("500.00").first()).toBeVisible();

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );

  // --- voiding gives the fee back
  await page.getByRole("button", { name: /^Anulo \d{4}-\d{4}/ }).click();
  await page.getByLabel("Arsyeja").fill("E2E mistake");
  await page.getByRole("button", { name: "Anulo bursën" }).click();
  await expect(page.getByText("Bursa u anulua.")).toBeVisible();
  await expect(page.getByText("1 000.00").first()).toBeVisible();
});

test("AC-8: the Secretariat reads but cannot grant, and a lecturer is refused", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/fin/scholarships");
  await expect(page.getByRole("heading", { level: 1, name: "Bursat" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Jep bursën" })).toHaveCount(0);
  await page.goto("/fin/scholarships/report");
  await expect(
    page.getByRole("heading", { level: 1, name: "Bursat sipas vitit dhe programit" }),
  ).toBeVisible();

  await signInFresh(page, "lecturer@dev.logos.test");
  await page.goto("/fin/scholarships");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
