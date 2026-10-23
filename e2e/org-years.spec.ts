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

// The dev database has 2025-2026 (closed), 2026-2027 (current), 2027-2028 (planned).
const TEST_YEAR = "2040-2041";

async function cleanup() {
  // Remove only the year this file creates; audit rows stay (append-only), the year is test data.
  await sql(
    "delete from semesters where academic_year_id in (select id from academic_years where code = $1)",
    [TEST_YEAR],
  );
  await sql("delete from academic_years where code = $1", [TEST_YEAR]);
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-10/12: the list shows the seeded years with status badges; a secretary reads but cannot write", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.getByRole("link", { name: "Vitet akademike" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Vitet akademike" })).toBeVisible();
  const current = page.getByRole("row").filter({ hasText: "2026-2027" });
  await expect(current).toContainText("Aktual");
  await expect(page.getByRole("row").filter({ hasText: "2025-2026" })).toContainText("I mbyllur");
  await expect(page.getByRole("row").filter({ hasText: "2027-2028" })).toContainText(
    "I planifikuar",
  );
  await expect(page.getByRole("link", { name: "Vit akademik i ri" })).toHaveCount(0);

  await page.goto("/org/years/new");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});

test("AC-12: a student cannot open the years", async ({ page }) => {
  await signInAs(page, "student@dev.logos.test");
  await expect(page.getByRole("link", { name: "Vitet akademike" })).toHaveCount(0);
  await page.goto("/org/years");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});

test("AC-1/2/3: a sysadmin creates a year with semesters; invalid dates show messages", async ({
  page,
}) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/org/years/new");
  // Controlled inputs: filling before React hydrates would be overwritten, so wait for the page to settle.
  await page.waitForLoadState("networkidle");

  const fill = async (label: string, index: number, value: string) =>
    page.getByLabel(label).nth(index).fill(value);
  // overlapping the seeded 2027-2028 year first
  await fill("Data e fillimit", 0, "2028-01-01");
  await fill("Data e mbarimit", 0, "2028-12-31");
  await fill("Data e fillimit", 1, "2028-01-01");
  await fill("Data e mbarimit", 1, "2028-06-30");
  await fill("Data e fillimit", 2, "2028-07-01");
  await fill("Data e mbarimit", 2, "2028-12-31");
  await page.getByRole("button", { name: "Krijo vitin akademik" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "mbivendoset" })).toBeVisible();

  await fill("Data e fillimit", 0, "2040-09-01");
  await fill("Data e mbarimit", 0, "2041-08-31");
  await fill("Data e fillimit", 1, "2040-09-01");
  await fill("Data e mbarimit", 1, "2041-01-31");
  await fill("Data e fillimit", 2, "2041-01-15"); // starts before semester 1 ends
  await fill("Data e mbarimit", 2, "2041-08-31");
  await page.getByRole("button", { name: "Krijo vitin akademik" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Semestri 2 duhet të fillojë" }),
  ).toBeVisible();

  await fill("Data e fillimit", 2, "2041-02-01");
  await page.getByRole("button", { name: "Krijo vitin akademik" }).click();
  await expect(page.getByRole("heading", { level: 1, name: TEST_YEAR })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByText("Planifikuar").or(page.getByText("I planifikuar")).first(),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Semestrat" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Semestri 2" })).toBeVisible();
});

test("AC-5/6/7: making a planned year current needs a reason, closes the previous year and locks it", async ({
  page,
}) => {
  // Work on a dedicated sequence so the seeded data is restored afterwards.
  await sql("update academic_years set status = 'PLANNED' where code = '2027-2028'"); // no-op, already planned
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/org/years?size=10");
  await page.getByRole("link", { name: "2027-2028" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "2027-2028" })).toBeVisible();

  try {
    await page.getByRole("button", { name: "Bëje aktual" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Bëje aktual" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Arsyeja është e detyrueshme" }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("2026-2027 mbyllet");
    await page.getByLabel("Arsyeja").fill("start of the 2027 academic year");
    await page.getByRole("dialog").getByRole("button", { name: "Bëje aktual" }).click();
    await expect(page.getByText("Aktual", { exact: true }).first()).toBeVisible();

    const years = await sql(
      "select code, status from academic_years where code in ('2026-2027','2027-2028') order by code",
    );
    expect(years.rows).toEqual([
      { code: "2026-2027", status: "CLOSED" },
      { code: "2027-2028", status: "CURRENT" },
    ]);
    const audit = await sql(
      "select action, reason from audit_logs where action in ('org.year.close','org.year.make_current') order by at desc limit 2",
    );
    expect(audit.rows.map((r) => r.reason)).toEqual([
      "start of the 2027 academic year",
      "start of the 2027 academic year",
    ]);

    // the closed year is read-only: no edit form, no make-current button
    await page.goto("/org/years?size=10");
    await page.getByRole("link", { name: "2026-2027" }).click();
    await expect(page.getByText("Ky vit është i mbyllur")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ruaj ndryshimet" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Bëje aktual" })).toHaveCount(0);

    // the header selector now defaults to the new current year
    await page.goto("/");
    await expect(page.getByLabel("Viti akademik").locator("option:checked")).toHaveText(
      "2027-2028",
    );
  } finally {
    await sql("update academic_years set status = 'PLANNED' where code = '2027-2028'");
    await sql("update academic_years set status = 'CURRENT' where code = '2026-2027'");
  }
});

test("AC-8/AC-10: editing a planned year updates the details and the history shows the change", async ({
  page,
}) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/org/years?size=10");
  await page.getByRole("link", { name: "2027-2028" }).click();
  const end = page.getByLabel("Data e mbarimit").first();
  const original = await end.inputValue();
  try {
    await end.fill("2028-09-15");
    await page.getByLabel("Data e mbarimit").nth(2).fill("2028-09-15");
    await page.getByRole("button", { name: "Ruaj ndryshimet" }).click();
    await expect(page.getByText("Ndryshimet u ruajtën.")).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 2, name: "Historiku i ndryshimeve" }),
    ).toBeVisible();
    await expect(page.getByText("org.year.update").first()).toBeVisible();
  } finally {
    await sql("update academic_years set end_date = $1 where code = '2027-2028'", [original]);
    await sql(
      "update semesters set end_date = $1 where number = 2 and academic_year_id = (select id from academic_years where code = '2027-2028')",
      [original],
    );
  }
});

test("AC-11: the new-year checklist page explains that steps arrive with the modules", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/org/years/rollover");
  await expect(
    page.getByRole("heading", { level: 1, name: "Fillimi i vitit të ri akademik" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /Hapat shfaqen këtu/ })).toBeVisible();
});

test("the year pages have no serious accessibility violations", async ({ page }) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  for (const path of ["/org/years", "/org/years/new", "/org/years/rollover"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      axe.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id} ${v.nodes[0]?.target}`),
    ).toEqual([]);
  }
});
