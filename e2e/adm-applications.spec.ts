import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

// Remove what the test creates: the "E2E" cycle with its applications, uploaded files, the
// candidates' e-mails and the rate-limit hits of the public pages.
async function cleanup() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const cycles = "(select id from application_cycles where name like 'E2E%')";
    await client.query(
      `delete from stored_files where id in (select file_id from application_documents where application_id in (select id from applications where cycle_id in ${cycles}))`,
    );
    await client.query(
      `delete from application_documents where application_id in (select id from applications where cycle_id in ${cycles})`,
    );
    await client.query(`delete from applications where cycle_id in ${cycles}`);
    await client.query(`delete from application_cycle_documents where cycle_id in ${cycles}`);
    await client.query("delete from application_cycles where name like 'E2E%'");
    await client.query("delete from email_outbox where type like 'adm.%'");
    await client.query("delete from rate_limit_hits");
  } finally {
    await client.end();
  }
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

const day = (offset: number) =>
  new Date(Date.now() + offset * 24 * 3_600_000).toISOString().slice(0, 10);

test("AC-1..AC-9, 11: staff opens a cycle, a candidate applies and uploads a document, staff sees it", async ({
  page,
  browser,
  baseURL,
}) => {
  // --- the Secretariat opens a cycle with one required document
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/adm/cycles");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Cikël i ri" }).click();
  await page.getByLabel("Emri", { exact: true }).fill("E2E Round");
  await page.getByLabel("Hapet më").fill(day(-30));
  await page.getByLabel("Mbyllet më").fill(day(30));
  await page.getByRole("button", { name: "Shto dokument" }).click();
  await page.getByLabel("Çelësi").fill("diploma");
  await page.getByLabel("Emri (shqip)").fill("Diploma e shkollës");
  await page.getByRole("button", { name: "Ruaj", exact: true }).click();
  await expect(page.getByText("Cikli u ruajt.")).toBeVisible();
  await expect(page.getByTestId("cycle-E2E Round")).toContainText("Diploma e shkollës");

  // --- a candidate (no login) fills the four steps
  const visitor = await browser.newContext({ baseURL });
  const apply = await visitor.newPage();
  await apply.goto("/apply");
  await expect(apply.getByRole("heading", { name: "Aplikim online" })).toBeVisible();
  expect(
    (await new AxeBuilder({ page: apply }).analyze()).violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);

  // an empty first step is refused on the page
  await apply.getByRole("button", { name: "Vazhdo" }).click();
  await expect(apply.getByText("Kjo fushë është e detyrueshme.").first()).toBeVisible();

  await apply.locator('input[name="firstName"]').fill("E2E Ana");
  await apply.locator('input[name="lastName"]').fill("Hoxha");
  await apply.locator('select[name="gender"]').selectOption("FEMALE");
  await apply.locator('input[name="birthDate"]').fill("2007-03-14");
  await apply.getByRole("button", { name: "Vazhdo" }).click();
  await apply.locator('input[name="email"]').fill("e2e-ana@example.com");
  await apply.locator('input[name="phone"]').fill("+355 69 000 0000");
  await apply.locator('input[name="address"]').fill("Rr. Kavajes 1, Tirane");
  await apply.getByRole("button", { name: "Vazhdo" }).click();
  await apply.locator('input[name="schoolName"]').fill("Gjimnazi");
  await apply.locator('input[name="graduationYear"]').fill("2025");
  await apply.locator('input[name="averageGrade"]').fill("11");
  await apply.getByRole("button", { name: "Vazhdo" }).click();
  await apply.locator('select[name="cycleId"]').selectOption({ label: "E2E Round" });
  await apply.locator('select[name="programId"]').selectOption({ index: 1 });
  await apply.getByRole("button", { name: "Dërgo aplikimin" }).click();
  await expect(apply.getByText("Duhet të jepni pëlqimin")).toBeVisible();
  await apply.locator('input[name="consent"]').check();
  await apply.getByRole("button", { name: "Dërgo aplikimin" }).click();
  // the server refuses the average of 11 and returns to the step that holds it
  await expect(apply.getByText("Mesatarja duhet të jetë midis 5 dhe 10.")).toBeVisible();
  await apply.locator('input[name="averageGrade"]').fill("9,25");
  await apply.getByRole("button", { name: "Vazhdo" }).click();
  await apply.getByRole("button", { name: "Dërgo aplikimin" }).click();

  // --- the private status page: reference, missing document, upload
  await expect(apply.getByRole("heading", { name: "Aplikimi juaj" })).toBeVisible();
  const reference = (await apply.locator("dd.font-tabular").first().innerText()).trim();
  expect(reference).toMatch(/^AP-[A-Z0-9]{8}$/);
  await expect(apply.getByTestId("doc-diploma")).toContainText("Mungon");
  await apply
    .getByTestId("doc-diploma")
    .locator('input[type="file"]')
    .setInputFiles({
      name: "diploma.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7 e2e document"),
    });
  await expect(apply.getByTestId("doc-diploma")).toContainText("Marrë: diploma.pdf");
  await expect(apply.getByText("Të gjitha dokumentet e detyrueshme janë marrë.")).toBeVisible();
  const statusUrl = apply.url().split("?")[0]!;

  // a wrong token answers 404
  const bad = await apply.goto(`/apply/status/${"a".repeat(43)}`);
  expect(bad?.status()).toBe(404);
  await apply.goto(statusUrl);
  await expect(apply.getByText(reference).first()).toBeVisible();
  await visitor.close();

  // the confirmation e-mail was queued with the private link
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const mail = await client.query(
      "select subject, text from email_outbox where type = 'adm.application-received'",
    );
    expect(mail.rows).toHaveLength(1);
    expect(mail.rows[0].subject).toContain(reference);
    expect(mail.rows[0].text).toContain("/apply/status/");
  } finally {
    await client.end();
  }

  // --- the Secretariat sees the application and downloads the document
  await page.goto("/adm/applications");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("link", { name: reference })).toBeVisible();
  await page.getByRole("link", { name: reference }).click();
  // The record page's h1 is the applicant; the reference is in the breadcrumb and the subtitle.
  await expect(page.getByRole("heading", { level: 1, name: /Hoxha/ })).toBeVisible();
  await expect(page.getByText(reference).first()).toBeVisible();
  const download = page.getByTestId("doc-diploma").getByRole("link", { name: /diploma\.pdf/ });
  await expect(download).toBeVisible();
  const res = await page.request.get((await download.getAttribute("href"))!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
});

test("AC-12: a student cannot open the applications or the cycles; the application page is public", async ({
  page,
}) => {
  await signInAs(page, "student@dev.logos.test");
  for (const path of ["/adm/applications", "/adm/cycles"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Nuk keni leje" })).toBeVisible();
  }
  // a candidate's upload route without a valid token is refused
  const res = await page.request.post(`/api/adm/applications/${"a".repeat(43)}/documents`, {
    multipart: {
      key: "diploma",
      file: { name: "x.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 x") },
    },
  });
  expect(res.status()).toBe(404);
});
