import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

async function sql(text: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await client.query(text, params);
  } finally {
    await client.end();
  }
}

const KEYS = "('staff-leave','staff-supplies','staff-certificate','staff-authorization')";

async function cleanup() {
  const subs = `(select s.id from form_submissions s join form_definitions d on d.id = s.definition_id where d.key in ${KEYS})`;
  await sql(`delete from form_submission_events where submission_id in ${subs}`);
  await sql(`delete from notifications where type = 'plt.form-status'`);
  await sql(`delete from form_submissions where id in ${subs}`);
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-1, AC-3, AC-4, AC-7..AC-9: a lecturer asks for leave; the head of department, then administration approve; HR reads the history", async ({
  page,
}) => {
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/off/requests");
  await expect(page.getByRole("heading", { level: 1, name: "Kërkesat e stafit" })).toBeVisible();
  await page.getByRole("link", { name: "Kërkesë për leje" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Lloji i lejes").selectOption("annual");
  await page.getByLabel("Nga data").fill("2026-12-01");
  await page.getByLabel("Deri më datë").fill("2026-12-10");
  await page.getByLabel("Arsyeja").fill("Pushim");
  await page.getByRole("button", { name: "Dërgo" }).click();
  const reference = (await page.locator("p.font-tabular").first().textContent())!.trim();
  expect(reference).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/);

  // forbidden: a lecturer neither handles the form nor reads the history
  await page.goto("/off/history");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();

  // the head of department has the first step only
  await page.context().clearCookies();
  await signInAs(page, "head-of-department@dev.logos.test");
  await page.goto(`/forms/inbox?reference=${reference}`);
  await page.getByRole("link", { name: reference }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Pushim", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kalo te: Miratuar", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Kalo te: Miratuar nga eprori" }).click();
  await expect(page.getByText("Gjendja u ndryshua.")).toBeVisible();

  // administration gives the final approval
  await page.context().clearCookies();
  await signInAs(page, "administration@dev.logos.test");
  await page.goto(`/forms/inbox?reference=${reference}`);
  await page.getByRole("link", { name: reference }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Kalo te: Miratuar nga eprori" })).toHaveCount(0);
  await page.getByRole("button", { name: "Kalo te: Miratuar", exact: true }).click();
  await expect(page.getByText("Gjendja u ndryshua.")).toBeVisible();

  const state = await sql("select state from form_submissions where reference = $1", [reference]);
  expect(state.rows[0].state).toBe("approved");

  // the lecturer sees the outcome
  await page.context().clearCookies();
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/off/requests");
  await expect(page.getByRole("row", { name: new RegExp(`${reference}.*Miratuar`) })).toBeVisible();

  // HR reads the history of the lecturer
  await page.context().clearCookies();
  await signInAs(page, "hr@dev.logos.test");
  await page.goto("/off/history");
  await page
    .getByRole("link", { name: /Lecturer|lecturer/ })
    .first()
    .click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("cell", { name: "Kërkesë për leje" })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} ${v.nodes[0]?.target}`),
  ).toEqual([]);
});

test("AC-2, AC-10: a student sees neither the staff pages nor the forms", async ({ page }) => {
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/off/requests");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  await page.goto("/forms");
  await expect(page.getByRole("link", { name: "Kërkesë për leje" })).toHaveCount(0);
  const response = await page.goto("/forms/staff-leave");
  expect(response?.status()).toBe(404);
});
