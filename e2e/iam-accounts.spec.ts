import { expect, test } from "@playwright/test";
import pg from "pg";
import { deleteTestUsers } from "./support/cleanup";
import { signInAs } from "./support/keycloak";
import { waitForMailLink } from "./support/mailpit";

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
  const persons = "(select id from persons where last_name like 'E2EAcct%')";
  const students = `(select id from students where person_id in ${persons})`;
  const enrollments = `(select id from enrollments where student_id in ${students})`;
  await sql(`delete from users where person_id in ${persons}`);
  await sql(`delete from year_registrations where enrollment_id in ${enrollments}`);
  await sql(`delete from enrollment_status_events where enrollment_id in ${enrollments}`);
  await sql(`delete from enrollments where student_id in ${students}`);
  await sql(`delete from students where person_id in ${persons}`);
  await sql("delete from persons where last_name like 'E2EAcct%'");
  await deleteTestUsers("e2eacct.");
}
test.beforeEach(cleanup);
test.afterAll(cleanup);

test("AC-1, AC-9, AC-5, AC-11: a secretary creates a student's account, sees it pending, and graduating the student switches it off", async ({
  page,
}) => {
  const email = `e2eacct.${Date.now()}@dev.logos.test`;
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/stu/students/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Emri", { exact: true }).fill("Besa");
  await page.getByLabel("Mbiemri").fill("E2EAcct");
  await page.getByLabel("Data e lindjes").fill("2004-05-06");
  await page.getByLabel("Email", { exact: true }).fill(email);
  const cohortValue = await page
    .locator("#e-cohort option", { hasText: "DEMO-BSC" })
    .first()
    .getAttribute("value");
  await page.getByLabel("Kohorta").selectOption(cohortValue!);
  await page.getByLabel("Data e fillimit").fill("2026-09-15");
  await page.getByRole("button", { name: "Regjistro studentin" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Besa E2EAcct" })).toBeVisible();
  const url = page.url();

  // no account yet; create it
  await expect(page.getByText("Pa llogari")).toBeVisible();
  await page.getByRole("button", { name: "Krijo llogarinë" }).click();
  await expect(page.getByText("Në pritje të aktivizimit")).toBeVisible({ timeout: 30_000 });
  await waitForMailLink(email, "action-token");
  const created = await sql("select active, last_login_at from users where email = $1", [email]);
  expect(created.rows[0]).toMatchObject({ active: true, last_login_at: null });

  // the never-activated report lists it
  await page.goto(`/admin/accounts?q=${encodeURIComponent("e2eacct.")}`);
  await expect(page.getByRole("row").filter({ hasText: email })).toHaveCount(1);

  // graduating the student ends access at once
  await page.goto(`${url}?tab=enrollments`);
  await page.waitForLoadState("networkidle");
  const row = page.getByRole("row").filter({ hasText: "DEMO-BSC" });
  await row.getByRole("button", { name: "Diplomo" }).click();
  await page.getByRole("dialog").getByLabel("Arsyeja").fill("Diplomim");
  await page.getByRole("dialog").getByRole("button", { name: "Diplomo" }).click();
  await expect(row.getByText("I diplomuar")).toBeVisible({ timeout: 30_000 });
  const after = await sql("select active from users where email = $1", [email]);
  expect(after.rows[0]).toMatchObject({ active: false });
  await page.goto(url);
  await expect(page.getByText("E çaktivizuar")).toBeVisible();
});

test("AC-12: a lecturer has no access to the accounts page", async ({ page }) => {
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/admin/accounts");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
