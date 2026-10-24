import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

// Remove the fees and plans the test creates; nothing else uses them yet.
async function cleanup() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("delete from payments");
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

test("AC-1, AC-2, AC-5: Finance sees the installments by due date and the debtors with contact data", async ({
  page,
}) => {
  await signInAs(page, "finance@dev.logos.test");

  // --- a tuition fee of 800 in one installment and the plans of the program
  await page.goto("/fin/fees?program=DEMO-BSC");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Shto një tarifë" }).click();
  await page.getByLabel("Shuma", { exact: true }).fill("800");
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

  // --- the deadline list shows the installment of the student, not paid
  await page.goto("/fin/lists/deadlines");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Këstet sipas afatit" })).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(number) });
  await expect(row).toContainText("800.00");

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );

  // --- far in the future the student has not closed the obligation: debtors list with the amount
  await page.goto("/fin/lists/clearance?asOf=2099-12-31");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Rregullimi financiar" })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(number) })).toContainText("Jo i rregullt");

  await page.getByRole("link", { name: "Debitorët" }).click();
  await page.waitForURL(/result=NOT_CLEARED/);
  await expect(page.getByRole("heading", { level: 1, name: "Debitorët" })).toBeVisible();
});

test("AC-7: the Secretariat reads the same lists, and a lecturer is refused", async ({ page }) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/fin/lists/deadlines");
  await expect(page.getByRole("heading", { level: 1, name: "Këstet sipas afatit" })).toBeVisible();
  await page.goto("/fin/lists/clearance");
  await expect(page.getByRole("heading", { level: 1, name: "Rregullimi financiar" })).toBeVisible();

  await signInFresh(page, "lecturer@dev.logos.test");
  await page.goto("/fin/lists/deadlines");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  await page.goto("/fin/lists/clearance");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
