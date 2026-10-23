import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
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

const rows = (page: Page) => page.getByRole("row").filter({ has: page.getByRole("rowheader") });
const names = async (page: Page) =>
  (await rows(page).getByRole("rowheader").allInnerTexts()).map((s) => s.trim());

test.afterEach(async () => {
  await sql("delete from saved_filters");
});

test("AC-3: sorting by a header toggles direction, keeps the URL, and marks aria-sort", async ({
  page,
}) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/admin/users?size=100");
  const asc = [...new Set(await names(page))]; // names can repeat; ties keep a fixed secondary order
  expect(asc.length).toBeGreaterThan(5);
  await expect(page.getByRole("columnheader", { name: "Emri" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );

  await page.getByRole("columnheader", { name: "Emri" }).getByRole("link").click();
  await expect(page).toHaveURL(/sort=name%3Adesc/);
  await expect(page.getByRole("columnheader", { name: "Emri" })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  expect([...new Set(await names(page))]).toEqual([...asc].reverse());
});

test("AC-3: page size and next/previous keep the other parameters", async ({ page }) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/admin/users?size=10&status=active");
  await expect(rows(page)).toHaveCount(10);
  await page.getByRole("link", { name: "Tjetra" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/size=10/);
  await expect(page).toHaveURL(/status=active/);
  await expect(page.getByText("Faqja 2 nga")).toBeVisible();
  await page.getByRole("link", { name: "E mëparshmja" }).click();
  await expect(page.getByText("Faqja 1 nga")).toBeVisible();
});

test("AC-4: text and select filters through the GET form, and clearing them", async ({ page }) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/admin/users");
  await page.getByLabel("Kërko sipas emrit ose emailit").fill("library@dev");
  await page.getByRole("button", { name: "Filtro" }).click();
  await expect(page).toHaveURL(/q=library%40dev/);
  expect(await names(page)).toEqual(["Dev Library"]);

  await page.getByRole("link", { name: "Pastro filtrat" }).click();
  await expect(page).not.toHaveURL(/q=/);
  expect((await names(page)).length).toBeGreaterThan(5);

  await page.getByLabel("Roli").selectOption("hr");
  await page.getByRole("button", { name: "Filtro" }).click();
  expect(await names(page)).toEqual(["Dev HR"]);
});

test("AC-5: the column chooser changes the columns and keeps them in the URL", async ({ page }) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/admin/users");
  await expect(page.getByRole("columnheader", { name: "Email" })).toBeVisible();
  await page.getByText("Kolonat", { exact: true }).click();
  await page.getByLabel("Email", { exact: true }).uncheck();
  await page.getByLabel("Rolet").uncheck();
  await page.getByRole("button", { name: "Filtro" }).last().click();
  await expect(page).toHaveURL(/cols=/);
  await expect(page.getByRole("columnheader", { name: "Email" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Rolet" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Emri" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Statusi" })).toBeVisible();
});

test("AC-6: save a filter, apply it from the list, delete it; other users never see it", async ({
  page,
  browser,
}) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/admin/users?role=secretary");
  await page.getByLabel("Emri i filtrit").fill("Sekretarët");
  await page.getByRole("button", { name: "Ruaj filtrin aktual" }).click();
  await expect(page.getByRole("link", { name: "Sekretarët" })).toBeVisible();

  // duplicate name is refused
  await page.getByLabel("Emri i filtrit").fill("Sekretarët");
  await page.getByRole("button", { name: "Ruaj filtrin aktual" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "përdoret tashmë" })).toBeVisible();

  await page.goto("/admin/users");
  await page.getByRole("link", { name: "Sekretarët" }).click();
  await expect(page).toHaveURL(/role=secretary/);
  expect(await names(page)).toContain("Dev Secretary");

  // another user's saved filter list is empty, even on a table they cannot read
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signInAs(otherPage, "hr@dev.logos.test");
  await otherPage.goto("/admin/users");
  await expect(otherPage.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  await other.close();

  await page.getByRole("button", { name: "Fshi filtrin: Sekretarët" }).click();
  await expect(page.getByRole("link", { name: "Sekretarët" })).toHaveCount(0);
});

test("AC-7/9/10: Excel and CSV exports match the list, are typed, and are audited", async ({
  page,
}) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/admin/users?role=secretary&cols=email,status");

  const xlsxHref = await page.getByRole("link", { name: /Excel/ }).getAttribute("href");
  const xlsx = await page.request.get(xlsxHref!);
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  expect(xlsx.headers()["content-disposition"]).toMatch(/filename="users-\d{4}-\d{2}-\d{2}\.xlsx"/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await xlsx.body()) as never);
  const ws = wb.worksheets[0]!;
  expect(ws.getRow(1).values).toEqual([undefined, "Emri", "Email", "Statusi"]);
  const emails = ws.getColumn(2).values.slice(2);
  expect(emails).toContain("secretary@dev.logos.test");
  expect(emails).not.toContain("hr@dev.logos.test");

  const csvHref = await page.getByRole("link", { name: /CSV/ }).getAttribute("href");
  const csv = await page.request.get(csvHref!);
  const csvText = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await csv.body());
  expect(csvText.startsWith("﻿Emri,Email,Statusi")).toBe(true);
  expect(csvText).toContain("secretary@dev.logos.test");

  const audit = await sql(
    "select after from audit_logs where action = 'plt.export.run' and entity_id = 'iam.users' order by at desc limit 2",
  );
  expect(audit.rows).toHaveLength(2);
  expect(audit.rows[0].after).toMatchObject({
    rows: expect.any(Number),
    filters: { role: "secretary" },
    columns: ["name", "email", "status"],
  });
  expect(JSON.stringify(audit.rows)).not.toContain("secretary@dev.logos.test");
});

test("AC-8: exports need the table permission", async ({ page, request }) => {
  expect((await request.get("/api/tables/iam.users/export?format=csv")).status()).toBe(401);
  await signInAs(page, "secretary@dev.logos.test");
  expect((await page.request.get("/api/tables/iam.users/export?format=csv")).status()).toBe(403);
  expect((await page.request.get("/api/tables/nope/export?format=csv")).status()).toBe(404);
  expect((await page.request.get("/api/tables/iam.users/export?format=pdf")).status()).toBe(400);
});

test("AC-11: the print view hides navigation and controls", async ({ page }) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/admin/users");
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("navigation", { name: "Navigimi kryesor" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Filtro" })).toBeHidden();
  await expect(page.getByRole("link", { name: /Excel/ })).toBeHidden();
  await expect(rows(page).first()).toBeVisible();
});

test("AC-12: usable at 360 px without page-level horizontal scroll; no serious axe violations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/admin/users");
  await expect(rows(page).first()).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const path of ["/admin/users", "/admin/audit"]) {
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
