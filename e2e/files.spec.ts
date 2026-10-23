import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signInAs } from "./support/keycloak";

const PDF = Buffer.from("%PDF-1.7\n% e2e document\n");

test("AC-3/7/12/14: a sysadmin uploads a PDF, sees it listed and downloads the same bytes", async ({
  page,
}) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.getByRole("link", { name: "Skedarët" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Skedarët" })).toBeVisible();

  const name = `raport-${Date.now()}.pdf`;
  await page
    .getByLabel("Ngarko skedar")
    .setInputFiles({ name, mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByRole("status").filter({ hasText: `U ngarkua: ${name}` })).toBeVisible();

  await page.reload();
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Në pritje");

  const href = await row.getByRole("link", { name: /Shkarko/ }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(await res.body()).toEqual(PDF);
  expect(res.headers()["content-disposition"]).toContain(`attachment; filename="${name}"`);
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
});

test("AC-4/12: oversize, wrong type and disguised files are refused with a message", async ({
  page,
}) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/admin/files");
  const input = page.getByLabel("Ngarko skedar");

  await input.setInputFiles({
    name: "big.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 0x25),
  });
  await expect(page.getByRole("alert").filter({ hasText: "Skedari" })).toContainText(
    "shumë i madh",
  );

  await input.setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await expect(page.getByRole("alert").filter({ hasText: "lejohet" })).toBeVisible();

  // Passes the browser-side check (declared PDF) but the content is not a PDF: the server refuses.
  await input.setInputFiles({
    name: "fake.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("<script>alert(1)</script>"),
  });
  await expect(page.getByRole("alert").filter({ hasText: "lejohet" })).toBeVisible();
});

test("AC-5/14: a secretary gets 403 on the page and the API; an anonymous request gets 401", async ({
  page,
  request,
}) => {
  const anonymous = await request.post("/api/files?purpose=general", {
    multipart: { file: { name: "a.pdf", mimeType: "application/pdf", buffer: PDF } },
  });
  expect(anonymous.status()).toBe(401);

  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/admin/files");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  const res = await page.request.post("/api/files?purpose=general", {
    multipart: { file: { name: "a.pdf", mimeType: "application/pdf", buffer: PDF } },
  });
  expect(res.status()).toBe(403);
  expect((await page.request.get("/api/files/does-not-exist")).status()).toBe(404);
});
