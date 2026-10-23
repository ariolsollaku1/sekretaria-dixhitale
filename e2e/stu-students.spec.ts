import AxeBuilder from "@axe-core/playwright";
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

test("AC-1..AC-10, 13: a secretary registers a student, enrolls and registers the year; finance reads without identifiers", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/stu/students/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Emri", { exact: true }).fill("Ana");
  await page.getByLabel("Mbiemri").fill("E2ELeka");
  await page.getByLabel("Data e lindjes").fill("2004-03-02");
  await page.getByLabel("Numri personal (NID)").fill("e2e-k40302001a");
  await page.getByLabel("NIM (nga SMIAL)").fill("e2e-nim-1");
  await page.getByLabel("Vendbanimi (qyteti/bashkia)").fill("Tiranë");
  const cohortValue = await page
    .locator("#e-cohort option", { hasText: "DEMO-BSC" })
    .first()
    .getAttribute("value");
  await page.getByLabel("Kohorta").selectOption(cohortValue!);
  await page.getByLabel("Data e fillimit").fill("2026-09-15");
  await page.getByRole("button", { name: "Regjistro studentin" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ana E2ELeka" })).toBeVisible();
  await expect(page.getByText("E2E-K40302001A")).toBeVisible(); // the secretary sees the identifier
  await expect(page.getByRole("definition").filter({ hasText: "E2E-NIM-1" })).toBeVisible();
  const url = page.url();

  // a second student with the same NIM is refused
  await page.goto("/stu/students/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Emri", { exact: true }).fill("Dyfish");
  await page.getByLabel("Mbiemri").fill("E2EDyfishi");
  await page.getByLabel("Data e lindjes").fill("2004-03-03");
  await page.getByLabel("NIM (nga SMIAL)").fill("E2E-NIM-1");
  await page.getByLabel("Regjistro menjëherë në një program").uncheck();
  await page.getByRole("button", { name: "Regjistro studentin" }).click();
  await expect(page.getByText("Ky NIM i përket një studenti tjetër.")).toBeVisible();

  // enrollment tab shows it; register the current year in the cohort's group
  await page.goto(`${url}?tab=enrollments`);
  await expect(page.getByRole("row").filter({ hasText: "DEMO-BSC" })).toBeVisible();
  await page.goto(`${url}?tab=years`);
  await page.waitForLoadState("networkidle");
  const yearValue = await page
    .locator('select[id^="ry-"] option', { hasText: "2026-2027" })
    .first()
    .getAttribute("value");
  await page.locator('select[id^="ry-"]').selectOption(yearValue!);
  await page.getByRole("button", { name: "Regjistro vitin" }).click();
  await expect(page.getByText("Grupi Grupi 1").first()).toBeVisible();
  await page.goto(`${url}?tab=history`);
  await expect(page.getByText("Aktiv").first()).toBeVisible();

  // the list finds the student by filters
  await page.goto("/stu/students?q=E2ELeka&program=DEMO-BSC&yearOfStudy=1&residence=Tiran");
  await expect(page.getByRole("link", { name: /^\d{6}$/ })).toHaveCount(1);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} ${v.nodes[0]?.target}`),
  ).toEqual([]);

  // finance reads without identifiers and without controls
  await page.context().clearCookies();
  await signInAs(page, "finance@dev.logos.test");
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1, name: "Ana E2ELeka" })).toBeVisible();
  await expect(page.getByText("E2E-K40302001A")).toHaveCount(0);
  await expect(page.getByText("Numri personal (NID)")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ndrysho" })).toHaveCount(0);
});

test("AC-9/AC-13: a coordinator sees only their program's students; a student only their own record", async ({
  page,
}) => {
  await signInAs(page, "program-coordinator@dev.logos.test");
  await page.goto("/stu/students");
  await expect(page.getByRole("heading", { level: 1, name: "Studentët" })).toBeVisible();
  // the demo student is in the coordinator's program
  await expect(page.getByRole("row").filter({ hasText: "DEMO-BSC" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Student i ri" })).toHaveCount(0);
  await page.goto("/stu/students/new");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();

  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/stu/me");
  await expect(
    page.getByRole("heading", { level: 1, name: "Të dhënat e mia si student" }),
  ).toBeVisible();
  await expect(page.getByText("DEMO-0001")).toBeVisible();
  await expect(page.getByText("DEMO-BSC").first()).toBeVisible();
  await page.goto("/stu/students");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
