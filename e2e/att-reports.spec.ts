import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

// ATT-02: the test creates two held DEMO101 classes (2 h each) for the students of the assignment's
// group: present at one, absent at the other = 50 %, below the 75 % threshold. It removes them after.
async function withDb<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
const cleanup = () =>
  withDb(async (c) => {
    await c.query("delete from attendance_marks");
    await c.query("delete from class_sessions");
  });

async function seedHeldClasses() {
  await withDb(async (c) => {
    const a = await c.query(
      `select ta.id, ta.group_id from teaching_assignments ta
         join plan_courses pc on pc.id = ta.plan_course_id
         join courses co on co.id = pc.course_id
        where co.code = 'DEMO101' order by ta.id limit 1`,
    );
    const { id, group_id } = a.rows[0];
    const students = await c.query(
      `select s.id from students s
         join enrollments e on e.student_id = s.id and e.status = 'ACTIVE'
         join year_registrations yr on yr.enrollment_id = e.id
        where yr.group_id = $1`,
      [group_id],
    );
    const classes: [number, string][] = [
      [10, "PRESENT"],
      [3, "ABSENT"],
    ];
    for (const [ago, status] of classes) {
      const sid = `e2e-att02-${ago}`;
      await c.query(
        `insert into class_sessions (id, assignment_id, date, start_minute, end_minute, hours, status, updated_at)
         values ($1, $2, (now() at time zone 'Europe/Tirane')::date - $3::int, 480, 570, 2, 'HELD', now())`,
        [sid, id, ago],
      );
      for (const s of students.rows)
        await c.query(
          `insert into attendance_marks (id, session_id, student_id, status, updated_at)
           values ($1, $2, $3, $4::attendance_status, now())`,
          [`${sid}-${s.id}`, sid, s.id, status],
        );
    }
  });
}

test.beforeEach(async () => {
  await cleanup();
  await seedHeldClasses();
});
test.afterEach(cleanup);

async function signInFresh(page: Page, email: string) {
  await page.context().clearCookies();
  await signInAs(page, email);
}

test("AC-3..AC-6, 8: a head reads the report and summary, a student sees only their own figures", async ({
  page,
}) => {
  await signInAs(page, "head-of-department@dev.logos.test");
  await page.goto("/att/report");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Raporti i pranisë" })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "DEMO101" }).first();
  await expect(row).toContainText("50");
  await expect(row).toContainText("Nën pragun");
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );

  await page.goto("/att/summary");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { level: 1, name: "Përmbledhja e pranisë" }),
  ).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "DEMO101" }).first()).toBeVisible();

  const csv = await page.request.get("/api/tables/att.report/export?format=csv");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("DEMO101");

  // --- the student: own summary, no reports, no export
  await signInFresh(page, "student@dev.logos.test");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/att/absences");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Prania ime" })).toBeVisible();
  const card = page.locator("li").filter({ hasText: "DEMO101" }).first();
  await expect(card).toContainText("50%");
  await expect(page.getByText("Nën 75%")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto("/att/report");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  const denied = await page.request.get("/api/tables/att.report/export?format=csv");
  expect(denied.status()).toBe(403);
});
