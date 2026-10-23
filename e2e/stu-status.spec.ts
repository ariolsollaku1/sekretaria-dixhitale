import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

async function cleanup() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const persons = "(select id from persons where last_name like 'E2E%')";
    const students = `(select id from students where person_id in ${persons})`;
    const enrollments = `(select id from enrollments where student_id in ${students})`;
    await client.query(`delete from year_registrations where enrollment_id in ${enrollments}`);
    await client.query(
      `delete from enrollment_status_events where enrollment_id in ${enrollments}`,
    );
    await client.query(`delete from enrollments where student_id in ${students}`);
    await client.query(`delete from students where person_id in ${persons}`);
    await client.query("delete from persons where last_name like 'E2E%'");
  } finally {
    await client.end();
  }
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-1..AC-3, 6: a secretary suspends, resumes and deregisters a student; the history shows each step", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/stu/students/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Emri", { exact: true }).fill("Besa");
  await page.getByLabel("Mbiemri").fill("E2EStatus");
  await page.getByLabel("Data e lindjes").fill("2004-05-06");
  const cohortValue = await page
    .locator("#e-cohort option", { hasText: "DEMO-BSC" })
    .first()
    .getAttribute("value");
  await page.getByLabel("Kohorta").selectOption(cohortValue!);
  await page.getByLabel("Data e fillimit").fill("2026-09-15");
  await page.getByRole("button", { name: "Regjistro studentin" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Besa E2EStatus" })).toBeVisible();
  const url = page.url();

  await page.goto(`${url}?tab=enrollments`);
  await page.waitForLoadState("networkidle");
  const row = page.getByRole("row").filter({ hasText: "DEMO-BSC" });
  await row.getByRole("button", { name: "Pezullo" }).click();
  // a reason is mandatory
  await page.getByRole("dialog").getByRole("button", { name: "Pezullo" }).click();
  await expect(page.getByRole("dialog").getByText("Shkruani arsyen.")).toBeVisible();
  await page.getByRole("dialog").getByLabel("Arsyeja").fill("Kërkesë personale");
  await page
    .getByRole("dialog")
    .getByLabel(/Dokumenti/)
    .fill("K-12/2026");
  await page.getByRole("dialog").getByRole("button", { name: "Pezullo" }).click();
  await expect(row.getByText("I pezulluar")).toBeVisible();

  // while suspended: resume and deregister are offered, suspend is not
  await expect(row.getByRole("button", { name: "Rifillo" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Pezullo" })).toHaveCount(0);
  await row.getByRole("button", { name: "Rifillo" }).click();
  await page.getByRole("dialog").getByLabel("Arsyeja").fill("U kthye");
  await page.getByRole("dialog").getByRole("button", { name: "Rifillo" }).click();
  await expect(row.getByText("Aktiv")).toBeVisible();

  await row.getByRole("button", { name: "Çregjistro" }).click();
  await page.getByRole("dialog").getByLabel("Arsyeja").fill("Largim vullnetar");
  await page.getByRole("dialog").getByRole("button", { name: "Çregjistro" }).click();
  await expect(row.getByText("I çregjistruar")).toBeVisible();
  await expect(row.getByRole("button")).toHaveCount(0); // final

  await page.goto(`${url}?tab=history`);
  await expect(page.getByText("Kërkesë personale")).toBeVisible();
  await expect(page.getByText("Dokumenti: K-12/2026")).toBeVisible();
  await expect(page.getByText("Largim vullnetar")).toBeVisible();

  // finance cannot change anything
  await page.context().clearCookies();
  await signInAs(page, "finance@dev.logos.test");
  await page.goto(`${url}?tab=enrollments`);
  await expect(page.getByRole("button", { name: "Pezullo" })).toHaveCount(0);
});
