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

// Everything these tests create carries the surname "E2E…" and is removed again.
async function cleanup() {
  const leads = "(select id from leads where last_name like 'E2E%')";
  await sql(`delete from lead_events where lead_id in ${leads}`);
  await sql(
    "delete from form_submission_events where submission_id in (select s.id from form_submissions s join leads l on l.submission_id = s.id where l.last_name like 'E2E%')",
  );
  const subs =
    "(select submission_id from leads where last_name like 'E2E%' and submission_id is not null)";
  await sql("delete from leads where last_name like 'E2E%'");
  await sql(`delete from form_submissions where id in ${subs}`);
  await sql(
    "delete from email_outbox where type = 'adm.lead-invitation' and to_address like 'e2e-%'",
  );
  await sql("delete from rate_limit_hits");
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-1, AC-2, AC-5..AC-8: a visitor leaves an interest; Student Affairs works the lead and invites; Finance only reads; a student is refused", async ({
  page,
  browser,
}) => {
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/f/interest");
  await visitor.waitForLoadState("networkidle");
  await visitor.getByRole("textbox", { name: "Emri", exact: true }).fill("Elira");
  await visitor.getByLabel("Mbiemri").fill("E2EInteres");
  await visitor.getByLabel("Email").fill("e2e-elira@t.test");
  await visitor.getByLabel("Programi i interesit").fill("DEMO-BSC");
  // consent is required
  await visitor.getByRole("button", { name: "Dërgo" }).click();
  await expect(visitor.getByRole("alert").first()).toBeVisible();
  await visitor.getByLabel(/Jam dakord që LOGOS/).check();
  await visitor.getByRole("button", { name: "Dërgo" }).click();
  const reference = (await visitor.locator("p.font-tabular").first().textContent())!.trim();
  expect(reference).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/);
  await visitor.context().close();

  await signInAs(page, "student-affairs@dev.logos.test");
  await page.goto("/adm/leads?name=E2EInteres");
  await expect(page.getByRole("heading", { level: 1, name: "Interesimet (leads)" })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => v.impact === "critical")).toEqual([]);
  await page.getByRole("link", { name: /E2EInteres Elira/ }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Elira E2EInteres" })).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "DEMO-BSC ·" })).toBeVisible();
  await expect(page.getByText(reference)).toBeVisible();

  await page.getByLabel("Shënim i ri").fill("E thirra, do të vijë në ditën e hapur");
  await page.getByRole("button", { name: "Shto shënimin" }).click();
  await expect(page.getByText("Shënimi u shtua.")).toBeVisible();
  await expect(page.getByText("E thirra, do të vijë në ditën e hapur")).toBeVisible();

  await page.getByRole("button", { name: "Dërgo ftesën" }).click();
  await expect(page.getByText("Ftesa u vendos në radhën e dërgimit.")).toBeVisible();
  const out = await sql(
    "select status, subject from email_outbox where to_address = 'e2e-elira@t.test' and type = 'adm.lead-invitation'",
  );
  expect(out.rows).toHaveLength(1);
  await expect(page.getByText("U dërgua ftesa për aplikim")).toBeVisible();
  await expect(page.getByText("I kontaktuar", { exact: true }).first()).toBeVisible();

  await page.getByLabel(/Arsyeja \(e detyrueshme/).fill("Zgjodhi një kolegj tjetër");
  await page.getByRole("button", { name: "Kalo te: I humbur" }).click();
  await expect(page.getByText("Statusi u ndryshua.")).toBeVisible();
  await expect(page.getByText("Zgjodhi një kolegj tjetër").first()).toBeVisible();

  // Finance reads the list and the lead but has no write controls
  await page.context().clearCookies();
  await signInAs(page, "finance@dev.logos.test");
  await page.goto("/adm/leads?name=E2EInteres");
  await expect(page.getByRole("link", { name: /E2EInteres Elira/ })).toBeVisible();
  await expect(page.getByText("Shto një interesim")).toHaveCount(0);
  await page.getByRole("link", { name: /E2EInteres Elira/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Elira E2EInteres" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Shto shënimin" })).toHaveCount(0);

  // forbidden: a student has no access to leads
  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/adm/leads");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});

test("AC-3, AC-4: the Secretariat adds a lead by hand and imports an event list; a bad file imports nothing", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/adm/leads");
  await page.waitForLoadState("networkidle");
  await page.getByText("Shto një interesim").click();
  await page.locator("#lead-new-firstName").fill("Genti");
  await page.locator("#lead-new-lastName").fill("E2EManual");
  await page.getByRole("button", { name: "Shto interesimin" }).click();
  await expect(page.getByRole("alert").first()).toContainText("email ose një telefon");
  await page.locator("#lead-new-phone").fill("+355690000001");
  await page.getByRole("button", { name: "Shto interesimin" }).click();
  await expect(page.getByText("U ruajt.")).toBeVisible();

  await page.getByText("Importo nga skedari CSV").click();
  const file = (rows: string) => ({
    name: "event.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`firstName,lastName,email,phone,program,consent\n${rows}`),
  });
  await page.setInputFiles(
    "#import-file",
    file("Hana,E2EImport,e2e-hana@t.test,,DEMO-BSC,po\n,E2EImport,bad,,,\n"),
  );
  await page.getByRole("button", { name: "Importo" }).click();
  await expect(page.getByText("Rreshti 3: emri dhe mbiemri janë të detyrueshëm")).toBeVisible();
  expect((await sql("select 1 from leads where last_name = 'E2EImport'")).rows).toHaveLength(0);

  await page.setInputFiles(
    "#import-file",
    file("Hana,E2EImport,e2e-hana@t.test,,DEMO-BSC,po\nIlir,E2EImport,e2e-ilir@t.test,,,\n"),
  );
  await page.getByRole("button", { name: "Importo" }).click();
  await expect(page.getByText("U importuan 2 interesime, u anashkaluan 0")).toBeVisible();
  const rows = await sql(
    "select consent, source from leads where last_name = 'E2EImport' order by first_name",
  );
  expect(rows.rows).toEqual([
    { consent: true, source: "EVENT" },
    { consent: false, source: "EVENT" },
  ]);
});
