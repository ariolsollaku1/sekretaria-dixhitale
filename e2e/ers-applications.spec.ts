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

const subs =
  "(select s.id from form_submissions s join form_definitions d on d.id = s.definition_id where d.key like 'erasmus-%')";
async function cleanup() {
  await sql(`delete from form_submission_events where submission_id in ${subs}`);
  await sql(`delete from form_submissions where id in ${subs}`);
  await sql("delete from rate_limit_hits");
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-1..AC-4, AC-8: a visitor applies publicly; the Erasmus officer shortlists and selects", async ({
  page,
  browser,
}) => {
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/f/erasmus-academic");
  await visitor.waitForLoadState("networkidle");
  await visitor.getByRole("textbox", { name: "Emri", exact: true }).fill("Besa");
  await visitor.getByLabel("Mbiemri").fill("E2EErasmus");
  await visitor.getByLabel("Email").fill("e2e-erasmus@t.test");
  await visitor.getByLabel("Departamenti").fill("Informatikë");
  await visitor.getByLabel("Pozicioni").fill("Lektore");
  await visitor.getByLabel("Institucioni pritës").fill("TU Wien");
  await visitor.getByLabel("Lloji i mobilitetit").selectOption("teaching");
  await visitor.getByLabel("Data e fillimit").fill("2027-03-01");
  await visitor.getByLabel("Data e mbarimit").fill("2027-03-05");
  await visitor.getByLabel("Motivimi").fill("Shkëmbim përvoje mësimdhënieje.");
  await visitor.getByLabel(/Deklaroj që të dhënat/).check();
  await visitor.getByRole("button", { name: "Dërgo" }).click();
  const reference = (await visitor.locator("p.font-tabular").first().textContent())!.trim();
  expect(reference).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/);

  await signInAs(page, "erasmus@dev.logos.test");
  await page.goto(`/ers/applications?reference=${reference}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Aplikimet Erasmus" })).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(reference) });
  await expect(row).toContainText("Staf akademik");
  await expect(row).toContainText("Besa E2EErasmus");
  await expect(row).toContainText("TU Wien");
  await expect(row).toContainText("2027-03-01 – 2027-03-05");
  await expect(row).toContainText("Dërguar");
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations.filter((v) => v.impact === "critical")).toEqual([]);

  await page.getByRole("link", { name: reference }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("TU Wien")).toBeVisible();
  const stateOf = async () =>
    (await sql("select state from form_submissions where reference = $1", [reference])).rows[0]
      .state;
  await page.getByRole("button", { name: "Kalo te: Në listën e ngushtë" }).click();
  await expect.poll(stateOf).toBe("shortlisted");
  await page.getByRole("button", { name: "Kalo te: Përzgjedhur" }).click();
  await expect.poll(stateOf).toBe("selected");

  await page.goto(`/ers/applications?reference=${reference}&state=selected`);
  await expect(page.getByRole("row", { name: new RegExp(reference) })).toContainText("Përzgjedhur");
  await visitor.context().close();
});

test("AC-7: a student has no access to the Erasmus applications", async ({ page }) => {
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/ers/applications");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
