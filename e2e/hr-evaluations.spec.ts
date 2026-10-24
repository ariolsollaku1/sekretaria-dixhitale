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
async function cleanup() {
  await sql(
    "delete from evaluations where campaign_id in (select id from evaluation_campaigns where name like 'E2E%')",
  );
  await sql("delete from evaluation_campaigns where name like 'E2E%'");
  await sql("delete from notifications where type = 'hr.evaluation'");
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-2..AC-10: HR opens a campaign, the head of department evaluates, HR reads the report, a lecturer is refused", async ({
  page,
}) => {
  // HR opens a campaign for lecturers; the demo lecturer is evaluated by the head of DEMO-A1
  await signInAs(page, "hr@dev.logos.test");
  await page.goto("/hr/evaluations");
  await expect(
    page.getByRole("heading", { level: 1, name: "Vlerësimi i performancës" }),
  ).toBeVisible();
  await page.getByLabel("Emri i fushatës").fill("E2E Vlerësimi 2026");
  await page.getByRole("button", { name: "Hap fushatën" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E Vlerësimi 2026" })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "Lektor" });
  await expect(row).toContainText("Në pritje");

  // the head of department fills in the evaluation
  await page.context().clearCookies();
  await signInAs(page, "head-of-department@dev.logos.test");
  await page.goto("/hr/evaluations/mine");
  await page.getByRole("link", { name: /Lektor/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Vlerësimi i/ })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);

  // required questions are enforced on the server
  await page.getByRole("button", { name: "Dërgo vlerësimin" }).click();
  await expect(page.getByText("Kjo fushë është e detyrueshme.").first()).toBeVisible();

  for (const question of [
    "Cilësia e mësimdhënies",
    "Aktiviteti kërkimor",
    "Kontributi në departament",
  ]) {
    const group = page.getByRole("radiogroup", { name: new RegExp(question) });
    await group.getByLabel("4", { exact: true }).check();
  }
  await page.getByRole("button", { name: "Dërgo vlerësimin" }).click();
  await expect(page).toHaveURL(/\/hr\/evaluations\/mine$/);
  await expect(page.getByRole("row").filter({ hasText: "Lektor" })).toContainText("Plotësuar");

  // HR sees the score in the campaign and the report
  await page.context().clearCookies();
  await signInAs(page, "hr@dev.logos.test");
  await page.goto("/hr/evaluations");
  await page.getByRole("link", { name: "E2E Vlerësimi 2026" }).first().click();
  await expect(page.getByRole("row").filter({ hasText: "Lektor" })).toContainText("4.00");
  await expect(page.getByRole("heading", { name: "Raporti i performancës" })).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Sipas departamentit" }).getByText("DEMO-A1"),
  ).toBeVisible();

  // forbidden: a lecturer has no campaigns page and no evaluation to fill in
  await page.context().clearCookies();
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/hr/evaluations");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  const id = (await sql("select id from evaluations limit 1")).rows[0].id as string;
  await page.goto(`/hr/evaluations/mine/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Faqja nuk u gjet" })).toBeVisible();
});
