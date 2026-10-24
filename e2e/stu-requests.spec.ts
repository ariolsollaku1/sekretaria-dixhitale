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

const KEYS = "('deregistration','deregistration-student','recognition','recognition-student')";
const DEV_STUDENT = "(select id from users where email = 'student@dev.logos.test')";

// The dev student is shared with other specs: whatever a request changed is put back.
async function cleanup() {
  const subs = `(select s.id from form_submissions s join form_definitions d on d.id = s.definition_id where d.key in ${KEYS})`;
  await sql(`delete from recognized_courses where submission_id in ${subs}`);
  await sql(`delete from form_submission_events where submission_id in ${subs}`);
  await sql(
    `delete from notifications where user_id in ${DEV_STUDENT} and type in ('plt.form-status', 'stu.status')`,
  );
  await sql(`delete from form_submissions where id in ${subs}`);
  const dev = `(select s.id from students s join users u on u.person_id = s.person_id where u.email = 'student@dev.logos.test')`;
  await sql(
    `delete from enrollment_status_events where document_ref like 'FORM:%' and enrollment_id in (select id from enrollments where student_id in ${dev})`,
  );
  await sql(
    `update enrollments set status = 'ACTIVE', ended_at = null where student_id in ${dev} and status = 'DEREGISTERED'`,
  );
  const persons = "(select id from persons where last_name like 'E2E%')";
  const students = `(select id from students where person_id in ${persons})`;
  await sql(
    `delete from year_registrations where enrollment_id in (select id from enrollments where student_id in ${students})`,
  );
  await sql(
    `delete from enrollment_status_events where enrollment_id in (select id from enrollments where student_id in ${students})`,
  );
  await sql(`delete from enrollments where student_id in ${students}`);
  await sql(`delete from students where person_id in ${persons}`);
  await sql("delete from persons where last_name like 'E2E%'");
  await sql("delete from rate_limit_hits");
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-1..AC-4: a student asks to be deregistered in the portal; the Secretariat approves and the enrollment closes", async ({
  page,
}) => {
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/forms");
  await expect(page.getByRole("link", { name: /Kërkesë për çregjistrim/ })).toBeVisible();
  await page.goto("/forms/deregistration-student");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Arsyeja e kërkesës").fill("Po kaloj në një universitet tjetër");
  await page.getByLabel("Data e dëshiruar e çregjistrimit").fill("2026-10-01");
  await page.getByLabel(/Kuptoj që çregjistrimi/).check();
  await page.getByRole("button", { name: "Dërgo" }).click();
  const reference = (await page.locator("p.font-tabular").first().textContent())!.trim();
  expect(reference).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/);

  // forbidden: a student has neither the inbox nor the recognition decision pages
  await page.goto("/stu/requests/anything");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();

  await page.context().clearCookies();
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto(`/forms/inbox?reference=${reference}`);
  await page.getByRole("link", { name: reference }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Po kaloj në një universitet tjetër")).toBeVisible();
  await page.getByRole("button", { name: "Kalo te: Miratuar" }).click();
  await expect(page.getByText("Gjendja u ndryshua.")).toBeVisible();

  const result = await sql(
    `select e.status, e.ended_at::text as ended, h.document_ref
       from enrollments e
       join enrollment_status_events h on h.enrollment_id = e.id and h.to_status = 'DEREGISTERED'
      where h.document_ref = $1`,
    [`FORM:${reference}`],
  );
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]).toMatchObject({ status: "DEREGISTERED", ended: "2026-10-01" });
});

test("AC-1, AC-5..AC-8: a visitor asks for recognition; approval needs a recorded course; finance and students cannot decide", async ({
  page,
  browser,
}) => {
  // a student without an account, as an alumnus would be
  await sql(
    `insert into persons (id, first_name, last_name, gender, birth_date, email, created_at, updated_at)
     values ('e2e-reco-person', 'Dritan', 'E2EKonvertim', 'MALE', '2001-02-03', 'e2e-reco@t.test', now(), now())`,
  );
  await sql(
    `insert into students (id, person_id, created_at, updated_at) values ('e2e-reco-student', 'e2e-reco-person', now(), now())`,
  );
  await sql(
    `insert into enrollments (id, student_id, program_id, cohort_id, registration_type, status, started_at, created_at, updated_at)
     select 'e2e-reco-enr', 'e2e-reco-student', c.program_id, c.id, 'FIRST_TIME', 'ACTIVE', date '2026-09-15', now(), now()
       from cohorts c join study_programs p on p.id = c.program_id where p.code = 'DEMO-BSC' limit 1`,
  );
  const number = (await sql("select student_number from students where id = 'e2e-reco-student'"))
    .rows[0].student_number as string;

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/f/recognition");
  await visitor.waitForLoadState("networkidle");
  await visitor.getByRole("textbox", { name: "Emri", exact: true }).fill("Dritan");
  await visitor.getByLabel("Mbiemri").fill("E2EKonvertim");
  await visitor.getByLabel("Numri i studentit").fill(number);
  await visitor.getByLabel("Data e lindjes").fill("2001-02-03");
  await visitor.getByLabel("Email").fill("e2e-reco@t.test");
  await visitor.getByLabel("Institucioni i mëparshëm").fill("Universiteti X");
  await visitor.getByLabel("Programi i studimit i mëparshëm").fill("Informatikë");
  await visitor.getByLabel(/Lëndët për njohje/).fill("Algoritmet 6 kredite");
  await visitor.getByRole("button", { name: "Dërgo" }).click();
  const reference = (await visitor.locator("p.font-tabular").first().textContent())!.trim();

  await signInAs(page, "secretary@dev.logos.test");
  await page.goto(`/forms/inbox?reference=${reference}`);
  await page.getByRole("link", { name: reference }).click();
  await page.waitForLoadState("networkidle");
  // approval without a recorded course is refused
  await page.getByRole("button", { name: "Kalo te: Miratuar" }).click();
  await expect(page.getByText("Regjistroni të paktën një lëndë të njohur")).toBeVisible();
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 10_000 });

  await page.getByRole("link", { name: "Hap vendimin e njohjes" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Vendimi i njohjes" })).toBeVisible();
  await expect(page.getByText("E2EKonvertim")).toBeVisible();
  await page.getByLabel("Kodi i lëndës").fill("NOPE");
  await page.getByRole("button", { name: "Shto lëndën e njohur" }).click();
  await expect(page.getByText("Lënda nuk u gjet.")).toBeVisible();
  await page.getByLabel("Kodi i lëndës").fill("demo101");
  await page.getByLabel("Kredite (opsionale)").fill("5");
  await page.getByRole("button", { name: "Shto lëndën e njohur" }).click();
  await expect(page.getByRole("cell", { name: "DEMO101", exact: true })).toBeVisible();
  // the same course twice is refused
  await page.getByLabel("Kodi i lëndës").fill("DEMO101");
  await page.getByRole("button", { name: "Shto lëndën e njohur" }).click();
  await expect(page.getByText("Kjo lëndë është e njohur tashmë")).toBeVisible();
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 10_000 });
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} ${v.nodes[0]?.target}`),
  ).toEqual([]);
  const decisionUrl = page.url();

  await page.getByRole("link", { name: reference }).click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Kalo te: Miratuar" }).click();
  await expect(page.getByText("Gjendja u ndryshua.")).toBeVisible();
  const rows = await sql(
    "select credits, voided_at from recognized_courses where student_id = 'e2e-reco-student'",
  );
  expect(rows.rows).toHaveLength(1);
  expect(rows.rows[0]).toMatchObject({ credits: 5, voided_at: null });

  // finance has no recognition permission at all
  await page.context().clearCookies();
  await signInAs(page, "finance@dev.logos.test");
  await page.goto(decisionUrl);
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
