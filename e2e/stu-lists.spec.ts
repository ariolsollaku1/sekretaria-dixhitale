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
async function cleanup() {
  const persons = "(select id from persons where last_name like 'E2E%')";
  const students = `(select id from students where person_id in ${persons})`;
  const enrollments = `(select id from enrollments where student_id in ${students})`;
  await sql(`delete from enrollment_status_events where enrollment_id in ${enrollments}`);
  await sql(`delete from enrollments where student_id in ${students}`);
  await sql(`delete from students where person_id in ${persons}`);
  await sql("delete from persons where last_name like 'E2E%'");
}
test.beforeEach(async () => {
  await cleanup();
  for (const [n, status, event] of [
    ["Susp", "SUSPENDED", "2026-10-01"],
    ["Dereg", "DEREGISTERED", "2026-10-02"],
    ["Old", "DEREGISTERED", "2025-10-02"],
  ] as const) {
    await sql(
      "insert into persons (id, first_name, last_name, gender, birth_date, created_at, updated_at) values ($1, 'Ana', $2, 'FEMALE', '2000-01-01', now(), now())",
      [`e2e-p-${n}`, `E2E${n}`],
    );
    await sql(
      "insert into students (id, person_id, created_at, updated_at) values ($1, $2, now(), now())",
      [`e2e-s-${n}`, `e2e-p-${n}`],
    );
    await sql(
      "insert into enrollments (id, student_id, program_id, cohort_id, registration_type, status, started_at, created_at, updated_at) select $1, $2, c.program_id, c.id, 'TRANSFER', $3::enrollment_status, '2025-09-15', now(), now() from cohorts c where c.name = '2026' limit 1",
      [`e2e-e-${n}`, `e2e-s-${n}`, status],
    );
    await sql(
      "insert into enrollment_status_events (id, enrollment_id, to_status, reason, effective_date, document_ref, created_at) values ($1, $2, $3::enrollment_status, 'Arsye provë', $4, 'D-1', now())",
      [`e2e-ev-${n}`, `e2e-e-${n}`, status, event],
    );
  }
});
test.afterEach(cleanup);

test("AC-1..AC-5: the three yearly lists show the right students; a student is refused", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/stu/lists");
  await expect(page.getByRole("heading", { level: 1, name: "Listat e Sekretarisë" })).toBeVisible();
  // registered: the seeded demo student (first registration), none of the e2e ones (no yearly registration)
  const demo = page.getByRole("row").filter({ hasText: "Student Demo" });
  await expect(demo).toContainText("Regjistrim i parë");
  await expect(page.getByRole("row").filter({ hasText: "E2E" })).toHaveCount(0);

  await page.goto("/stu/lists?list=suspended");
  const susp = page.getByRole("row").filter({ hasText: "E2ESusp" });
  await expect(susp).toContainText("Arsye provë");
  await expect(susp).toContainText("D-1");
  await expect(page.getByRole("row").filter({ hasText: "E2EDereg" })).toHaveCount(0);

  await page.goto("/stu/lists?list=deregistered");
  await expect(page.getByRole("row").filter({ hasText: "E2EDereg" })).toBeVisible();
  // an event from the previous year is outside the window
  await expect(page.getByRole("row").filter({ hasText: "E2EOld" })).toHaveCount(0);
  await page.goto("/stu/lists?list=deregistered&program=NOPE");
  await expect(page.getByRole("row").filter({ hasText: "E2EDereg" })).toHaveCount(0);

  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/stu/lists");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
