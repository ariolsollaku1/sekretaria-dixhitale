import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

// FIN-04: the job itself is covered by integration tests; here the log page is checked with a
// reminder row the test inserts for the demo student and removes again.
async function withDb<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
async function cleanup() {
  await withDb(async (c) => {
    await c.query("delete from payment_reminders");
    await c.query("delete from payments");
    await c.query("delete from plan_installments");
    await c.query("delete from payment_plans");
  });
}
async function seedReminder() {
  return withDb(async (c) => {
    const { rows } = await c.query(
      `select e.id as enrollment_id, s.id as student_id, s.student_number,
              (select id from academic_years where status = 'CURRENT' order by start_date desc limit 1) as year_id
         from students s join enrollments e on e.student_id = s.id
        where s.nim = 'DEMO-0001' limit 1`,
    );
    const r = rows[0];
    const plan = await c.query(
      `insert into payment_plans (id, enrollment_id, academic_year_id, updated_at)
       values (gen_random_uuid()::text, $1, $2, now()) returning id`,
      [r.enrollment_id, r.year_id],
    );
    const inst = await c.query(
      `insert into plan_installments (id, plan_id, sequence, kind, label, due_date, amount, updated_at)
       values (gen_random_uuid()::text, $1, 1, 'TUITION', '', (now() at time zone 'Europe/Tirane')::date + 10, 750.00, now())
       returning id`,
      [plan.rows[0].id],
    );
    await c.query(
      `insert into payment_reminders (id, installment_id, student_id, kind, outcome, due_date, outstanding)
       values (gen_random_uuid()::text, $1, $2, 'UPCOMING', 'SENT', (now() at time zone 'Europe/Tirane')::date + 10, 750.00)`,
      [inst.rows[0].id, r.student_id],
    );
    return r.student_number as string;
  });
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

async function signInFresh(page: Page, email: string) {
  await page.context().clearCookies();
  await signInAs(page, email);
}

test("AC-6, AC-7: Finance and the Secretariat read the reminder log; a student and a lecturer are refused", async ({
  page,
}) => {
  const studentNumber = await seedReminder();
  await signInAs(page, "finance@dev.logos.test");
  await page.goto("/fin/reminders");
  await expect(page.getByRole("heading", { level: 1, name: "Kujtesat e pagesave" })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: studentNumber });
  await expect(row).toContainText("750.00");
  await expect(row).toContainText("Para afatit");
  await expect(row).toContainText("Dërguar");

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} ${v.nodes[0]?.target}`),
  ).toEqual([]);

  await signInFresh(page, "secretary@dev.logos.test");
  await page.goto("/fin/reminders");
  await expect(page.getByRole("row").filter({ hasText: studentNumber })).toBeVisible();

  for (const who of ["student", "lecturer"]) {
    await signInFresh(page, `${who}@dev.logos.test`);
    await page.goto("/fin/reminders");
    await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  }
});
