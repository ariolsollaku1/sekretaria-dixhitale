import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
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
  await sql("delete from courses where code like 'E2E%'");
  await sql("delete from course_categories where code like 'E2E%'");
  await sql("update courses set name = 'Demo Course 101' where code = 'DEMO101'");
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

const HEADER =
  "code,name,name_en,credits,category,lecture_hours,seminar_hours,lab_hours,department";

test("AC-8/12: staff read the catalog without write controls; a student is refused", async ({
  page,
}) => {
  await signInAs(page, "lecturer@dev.logos.test");
  await page.getByRole("link", { name: "Lëndët" }).first().click();
  await expect(page.getByRole("row").filter({ hasText: "DEMO101" })).toContainText("E detyrueshme");
  await expect(page.getByRole("link", { name: "Lëndë e re" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Importo nga Excel/CSV" })).toHaveCount(0);

  await page.goto("/cur/courses/new");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  await page.goto("/cur/courses/import");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  expect((await page.request.get("/cur/courses/import/template")).status()).toBe(403);

  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/cur/courses");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});

test("AC-3/4: a head of department writes only their own department's courses", async ({
  page,
}) => {
  await signInAs(page, "head-of-department@dev.logos.test");
  await page.goto("/cur/courses/new");
  await page.waitForLoadState("networkidle");
  // only DEMO-A1 is offered (the head is scoped to it)
  await expect(page.getByLabel("Departamenti").locator("option")).toHaveText([
    "DEMO-A / DEMO-A1 — Demo Department A1",
  ]);
  await page.getByLabel("Kodi").fill("e2e-101");
  await page.getByLabel("Emri", { exact: true }).fill("E2E Course");
  await page.getByLabel("Kreditet").fill("6");
  await page.getByLabel("Orë leksioni").fill("30");
  await page.getByRole("button", { name: "Krijo lëndën" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E-101 — E2E Course" })).toBeVisible({
    timeout: 30_000,
  });

  // own course: editable
  await page.getByLabel("Emri", { exact: true }).fill("E2E Course renamed");
  await page.getByRole("button", { name: "Ruaj ndryshimet" }).click();
  await expect(page.getByText("Ndryshimet u ruajtën.")).toBeVisible();

  // a course of another department: read-only
  await page.goto("/cur/courses?q=DEMO201");
  await page.getByRole("link", { name: "DEMO201" }).click();
  await expect(
    page.getByText("Mund ta shihni këtë lëndë, por nuk keni leje ta ndryshoni."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Ruaj ndryshimet" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Çaktivizo" })).toHaveCount(0);
});

test("AC-2/5/6: a sysadmin manages categories and courses; duplicates and reasons are enforced", async ({
  page,
}) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/cur/categories");
  await page.getByLabel("Kodi").fill("e2e_cat");
  await page.getByLabel("Emri në shqip").fill("Kategori testi");
  await page.getByLabel("Emri në anglisht").fill("Test category");
  await page.getByRole("button", { name: "Krijo kategorinë" }).click();
  await expect(page.getByText("E2E_CAT").first()).toBeVisible();

  await page.goto("/cur/courses/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Kodi").fill("E2E-DUP");
  await page.getByLabel("Emri", { exact: true }).fill("First");
  await page.getByLabel("Kreditet").fill("5");
  await page.getByLabel("Kategoria").selectOption({ label: "Kategori testi" });
  await page.getByRole("button", { name: "Krijo lëndën" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E-DUP — First" })).toBeVisible({
    timeout: 30_000,
  });

  await page.goto("/cur/courses/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Kodi").fill("DEMO101");
  await page.getByLabel("Emri", { exact: true }).fill("Again");
  await page.getByLabel("Kreditet").fill("5");
  await page.getByRole("button", { name: "Krijo lëndën" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "përdoret tashmë" })).toBeVisible();

  await page.goto("/cur/courses?q=E2E-DUP");
  await page.getByRole("link", { name: "E2E-DUP" }).click();
  await page.getByRole("button", { name: "Çaktivizo" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Çaktivizo" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Arsyeja është e detyrueshme" }),
  ).toBeVisible();
  await page.getByLabel("Arsyeja").fill("duplicate");
  await page.getByRole("dialog").getByRole("button", { name: "Çaktivizo" }).click();
  await expect(page.getByText("Joaktiv").first()).toBeVisible();
});

test("AC-9/10/11: import preview shows errors and blocks; a clean file imports all rows; the template downloads", async ({
  page,
}) => {
  await signInAs(page, "head-of-department@dev.logos.test");
  const template = await page.request.get("/cur/courses/import/template");
  expect(template.status()).toBe(200);
  expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(await template.body())).toContain(
    HEADER,
  );

  await page.goto("/cur/courses/import");
  await page.waitForLoadState("networkidle");
  const input = page.getByLabel("Skedari (.csv ose .xlsx)");

  const withForeign = `${HEADER}\nE2EI1,Import një,,6,compulsory,30,0,0,demo-a1\nE2EI2,Import dy,,6,,30,,,DEMO-A2\nE2EI3!,Bad,,6,,,,,DEMO-A1\n`;
  await input.setInputFiles({
    name: "courses.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(withForeign),
  });
  await expect(page.getByText("1 nga 3 rreshta janë të vlefshëm")).toBeVisible();
  await expect(page.getByText("Nuk keni leje për këtë departament.")).toBeVisible();
  await expect(page.getByText("Kodi duhet të ketë 2–20 karaktere")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Importo \d+ lëndë$/ })).toBeDisabled();
  expect(
    (await sql("select count(*)::int as n from courses where code like 'E2E%'")).rows[0].n,
  ).toBe(0);

  const clean = `${HEADER.replaceAll(",", ";")}\nE2EI1;Import një;;6;compulsory;30;0;0;demo-a1\nE2EI2;Import dy;;5,0;;;;;DEMO-A1\n`;
  await input.setInputFiles({
    name: "courses.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(clean),
  });
  await expect(page.getByText("2 nga 2 rreshta janë të vlefshëm")).toBeVisible();
  await page.getByRole("button", { name: "Importo 2 lëndë" }).click();
  await expect(page.getByText("U krijuan 2, u përditësuan 0, u anashkaluan 0.")).toBeVisible();
  expect(
    (await sql("select count(*)::int as n from courses where code like 'E2EI%'")).rows[0].n,
  ).toBe(2);
});

test("AC-9: an Excel file imports too", async ({ page }) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Courses");
  ws.addRow(["code", "name", "credits", "department"]);
  ws.addRow(["E2EX1", "Nga Excel", 6, "DEMO-A1"]);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/cur/courses/import");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Skedari (.csv ose .xlsx)").setInputFiles({
    name: "courses.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  await expect(page.getByText("1 nga 1 rreshta janë të vlefshëm")).toBeVisible();
  await page.getByRole("button", { name: "Importo 1 lëndë" }).click();
  await expect(page.getByText("U krijuan 1, u përditësuan 0, u anashkaluan 0.")).toBeVisible();
});

test("the catalog pages have no serious accessibility violations", async ({ page }) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  for (const path of [
    "/cur/courses",
    "/cur/courses/new",
    "/cur/courses/import",
    "/cur/categories",
  ]) {
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
