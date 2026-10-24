import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

// Archive documents are never deleted by the application: the cleanup steps around the trigger.
async function cleanup() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("alter table approved_documents disable trigger user");
    await client.query("delete from approved_documents");
    await client.query("alter table approved_documents enable trigger user");
    await client.query("commit");
  } finally {
    await client.end();
  }
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-2..AC-5: the secretariat files a decision and withdraws it; a coordinator reads it", async ({
  page,
  browser,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/cur/archive");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: /Arkiva e dokumenteve/ })).toBeVisible();

  const section = page.getByRole("region", { name: "I gjithë kolegji" });
  await section.getByRole("button", { name: "Shto dokument" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({ name: "vendim.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(dialog.getByText(/vendim\.pdf/)).toBeVisible();
  await dialog.getByLabel("Lloji").selectOption("DECISION");
  await dialog.getByLabel("Titulli").fill("Vendimi i Senatit për diplomën");
  await dialog.getByLabel("Nr. i vendimit (opsionale)").fill("12/2026");
  await dialog.getByRole("button", { name: "Ruaj" }).click();
  await expect(page.getByText("Dokumenti u shtua.")).toBeVisible();

  const row = section.getByRole("row", { name: /Vendimi i Senatit/ });
  await expect(row.getByText("12/2026")).toBeVisible();
  const href = await row.getByRole("link", { name: "vendim.pdf" }).getAttribute("href");
  expect((await page.request.get(href!)).status()).toBe(200);

  // a program coordinator may read the institution-wide document but has no actions
  const coordCtx = await browser.newContext();
  const coord = await coordCtx.newPage();
  await signInAs(coord, "program-coordinator@dev.logos.test");
  await coord.goto("/cur/archive");
  await expect(coord.getByText("Vendimi i Senatit për diplomën")).toBeVisible();
  await expect(coord.getByRole("button", { name: "Shto dokument" })).toHaveCount(0);
  await expect(coord.getByRole("button", { name: "Tërhiq" })).toHaveCount(0);
  expect((await coord.request.get(href!)).status()).toBe(200);

  await row.getByRole("button", { name: "Tërhiq" }).click();
  await page.getByRole("dialog").getByLabel("Arsyeja").fill("Skedar i gabuar");
  await page.getByRole("dialog").getByRole("button", { name: "Tërhiq" }).click();
  await expect(page.getByText("Dokumenti u tërhoq.")).toBeVisible();
  await expect(row.getByText("Tërhequr")).toBeVisible();

  // withdrawn: hidden from the coordinator, file refused
  await coord.reload();
  await expect(coord.getByText("Vendimi i Senatit për diplomën")).toHaveCount(0);
  expect((await coord.request.get(href!)).status()).toBe(404);
  await coordCtx.close();

  await page.waitForSelector("[data-sonner-toast]", { state: "detached" });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
});

test("AC-7: a lecturer cannot open the archive", async ({ page }) => {
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/cur/archive");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
