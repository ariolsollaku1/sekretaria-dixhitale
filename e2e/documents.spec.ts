import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

// Published templates and issued documents are frozen by triggers: the cleanup steps around them.
async function query<T = unknown>(sql: string): Promise<T[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("alter table document_templates disable trigger user");
    await client.query("alter table issued_documents disable trigger user");
    const r = await client.query(sql);
    await client.query("alter table document_templates enable trigger user");
    await client.query("alter table issued_documents enable trigger user");
    await client.query("commit");
    return r.rows as T[];
  } finally {
    await client.end();
  }
}
async function cleanup() {
  await query("delete from issued_documents where type = 'plt.sample'");
  await query("delete from document_templates where type = 'plt.sample'");
  await query("delete from document_counters where type = 'plt.sample'");
  await query("delete from rate_limit_hits");
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-1, 4, 5, 8, 9, 10: a sysadmin publishes a template, issues a test document, and anyone verifies it", async ({
  page,
  browser,
}) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/admin/documents/new");
  await page.waitForLoadState("networkidle");

  // an unclosed block is refused with its line
  const html = page.getByLabel("HTML i shabllonit");
  await html.fill("<p>{{#if x}}</p>");
  await page.getByRole("button", { name: "Ruaj skicën" }).click();
  await expect(page.getByText(/Blloku nuk është mbyllur/)).toBeVisible();

  await html.fill(
    "<html><body><h1>{{title}}</h1><p>{{number}}</p><div>{{{qr}}}</div></body></html>",
  );
  await page.getByRole("button", { name: "Ruaj skicën" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /Dokument provë · SQ · v1/ }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");

  // the preview is a real PDF
  const previewHref = await page.getByRole("link", { name: "Shiko si PDF" }).getAttribute("href");
  const preview = await page.request.get(previewHref!);
  expect(preview.status()).toBe(200);
  expect(preview.headers()["content-type"]).toBe("application/pdf");
  expect((await preview.body()).subarray(0, 4).toString()).toBe("%PDF");
  expect(await query("select 1 from issued_documents")).toHaveLength(0);

  await page.getByRole("button", { name: "Publiko" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publiko" }).click();
  await expect(page.getByText("Shablloni u publikua.")).toBeVisible();
  await expect(page.getByText("Publikuar").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Ruaj skicën" })).toHaveCount(0);

  await page.goto("/admin/documents");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Lësho provë (SQ)" }).click();
  await expect(page.getByText(/U lëshua TEST-\d{4}-00001\./)).toBeVisible();

  await page.goto("/admin/documents/issued");
  const year = new Date().getFullYear();
  const link = page.getByRole("link", { name: new RegExp(`TEST-${year}-00001`) });
  await expect(link).toBeVisible();
  const download = await page.request.get((await link.getAttribute("href"))!);
  expect((await download.body()).subarray(0, 4).toString()).toBe("%PDF");

  // anyone with the code sees the document without logging in
  const [issued] = await query<{ verify_code: string }>("select verify_code from issued_documents");
  const anon = await browser.newContext();
  const verify = await anon.newPage();
  await verify.goto(`/verify/${issued!.verify_code}`);
  await expect(
    verify.getByRole("heading", { level: 1, name: "Verifikimi i dokumentit" }),
  ).toBeVisible();
  await expect(verify.getByText("I vlefshëm")).toBeVisible();
  await expect(verify.getByText(`TEST-${year}-00001`)).toBeVisible();
  expect(
    (await new AxeBuilder({ page: verify }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  expect((await anon.request.get("/verify/does-not-exist-0000000000")).status()).toBe(404);

  // cancel with a reason
  await page.getByRole("button", { name: "Anulo", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Anulo dokumentin" })).toBeDisabled();
  await dialog.getByLabel("Arsyeja").fill("E lëshuar gabimisht");
  await dialog.getByRole("button", { name: "Anulo dokumentin" }).click();
  await expect(page.getByText("Dokumenti u anulua.")).toBeVisible();
  await verify.reload();
  await expect(verify.getByText("Anuluar")).toBeVisible();
  await anon.close();

  await page.waitForSelector("[data-sonner-toast]", { state: "detached" });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
});

test("AC-11: other roles cannot manage templates or read the preview", async ({ page }) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/admin/documents");
  await expect(page.getByRole("heading", { name: /Nuk keni leje|Qasje e ndaluar/i })).toBeVisible();
  const response = await page.request.get("/api/documents/preview/whatever");
  expect(response.status()).toBe(403);
});
