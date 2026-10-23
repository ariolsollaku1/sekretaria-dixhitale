import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

// Approved syllabi are frozen by a trigger: the cleanup steps around it.
async function cleanup() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("alter table syllabi disable trigger user");
    await client.query("delete from syllabi");
    await client.query("alter table syllabi enable trigger user");
    await client.query("commit");
  } finally {
    await client.end();
  }
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-2..AC-4, 8, 9: a coordinator uploads, approves and replaces a syllabus; a student sees only the approved one", async ({
  page,
  browser,
}) => {
  await signInAs(page, "program-coordinator@dev.logos.test");
  await page.goto("/cur/syllabi");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: /Syllabuset/ })).toBeVisible();
  await expect(page.getByText(/lëndë pa program të miratuar/).first()).toBeVisible();

  const row = page.getByRole("row", { name: /DEMO101/ });
  await row.getByRole("button", { name: "Ngarko" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({ name: "syllabus.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(dialog.getByText(/syllabus\.pdf/)).toBeVisible();
  await dialog.getByLabel("Shënime (opsionale)").fill("Versioni i parë");
  await dialog.getByRole("button", { name: "Ruaj skicën" }).click();
  await expect(page.getByText("Skica u ruajt.")).toBeVisible();
  await expect(row.getByText("Skicë", { exact: true })).toBeVisible();

  // a student sees nothing of the draft
  const studentCtx = await browser.newContext();
  const student = await studentCtx.newPage();
  await signInAs(student, "student@dev.logos.test");
  await student.goto("/cur/syllabi");
  await expect(student.getByRole("row", { name: /DEMO101/ }).getByText("Mungon")).toBeVisible();
  await expect(student.getByRole("button", { name: "Ngarko" })).toHaveCount(0);

  await row.getByRole("button", { name: "Miratoje" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Miratoje" }).click();
  await expect(page.getByText("Programi u miratua.")).toBeVisible();
  const link = row.getByRole("link", { name: /Shkarko v1/ });
  await expect(link).toBeVisible();
  const ok = await page.request.get((await link.getAttribute("href"))!);
  expect(ok.status()).toBe(200);

  // the student now gets the approved file, still no actions
  await student.reload();
  const studentLink = student
    .getByRole("row", { name: /DEMO101/ })
    .getByRole("link", { name: /Shkarko v1/ });
  await expect(studentLink).toBeVisible();
  expect((await student.request.get((await studentLink.getAttribute("href"))!)).status()).toBe(200);
  await expect(student.getByRole("button", { name: "Miratoje" })).toHaveCount(0);

  // a second version waits as a draft; the student's file route refuses it
  await row.getByRole("button", { name: "Version i ri" }).click();
  await page
    .getByRole("dialog")
    .locator('input[type="file"]')
    .setInputFiles({ name: "v2.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByRole("dialog").getByText(/v2\.pdf/)).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Ruaj skicën" }).click();
  await expect(row.getByText("Skicë v2 në pritje")).toBeVisible();
  const draftLink = await row.getByRole("link", { name: /Skica v2/ }).getAttribute("href");
  expect((await student.request.get(draftLink!)).status()).toBe(404);
  await studentCtx.close();

  await row.getByRole("link", { name: "Historiku" }).click();
  await expect(page.getByRole("cell", { name: "Miratuar" }).first()).toBeVisible();
  await page.waitForSelector("[data-sonner-toast]", { state: "detached" });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
});

test("AC-10: a lecturer sees approved syllabi but cannot reach the history", async ({ page }) => {
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/cur/syllabi");
  await expect(page.getByRole("heading", { level: 1, name: /Syllabuset/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ngarko" })).toHaveCount(0);
  await page.goto("/cur/syllabi/whatever");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
