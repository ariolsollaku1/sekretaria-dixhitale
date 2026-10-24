import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

// Issued documents are immutable by a trigger: the cleanup steps around it.
async function cleanup() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("alter table issued_documents disable trigger user");
    await client.query("delete from issued_documents where type = 'cur.study-package'");
    await client.query("alter table issued_documents enable trigger user");
    await client.query("commit");
  } finally {
    await client.end();
  }
}
test.beforeEach(cleanup);
test.afterAll(cleanup);

test("AC-1, 2, 7, 9, 11: the secretary finds a student and issues the package; the PDF downloads", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/cur/packages?q=Student");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Paketat e studimit" })).toBeVisible();
  await expect(page.getByText("DEMO-BSC").first()).toBeVisible();
  await expect(page.getByText(/kredite/).first()).toBeVisible();

  await page.getByRole("button", { name: "Lësho paketën" }).first().click();
  await expect(page.getByText(/Paketa PLN-\d{4}-\d{5} u lëshua/)).toBeVisible();

  const row = page.getByRole("row", { name: /PLN-/ }).first();
  await expect(row).toBeVisible();
  const href = await row.getByRole("link", { name: "Shkarko" }).getAttribute("href");
  const file = await page.request.get(href!);
  expect(file.ok()).toBe(true);
  expect((await file.body()).subarray(0, 4).toString()).toBe("%PDF");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("AC-7, 8, 9: a student generates only their own package, cannot open the staff page", async ({
  page,
}) => {
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/cur/my-package");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { level: 1, name: "Paketa ime e studimit" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lësho paketën" }).first().click();
  await expect(page.getByText(/Paketa PLN-\d{4}-\d{5} u lëshua/)).toBeVisible();
  const link = page.getByRole("link", { name: "Shkarko" }).first();
  await expect(link).toBeVisible();
  const file = await page.request.get((await link.getAttribute("href"))!);
  expect((await file.body()).subarray(0, 4).toString()).toBe("%PDF");

  // forbidden: the staff page and its search
  await page.goto("/cur/packages?q=Student");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});

test("AC-7: staff without the grant cannot use the student page", async ({ page }) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/cur/my-package");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
