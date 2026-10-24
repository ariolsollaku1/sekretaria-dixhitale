import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

// The test links an application (average 8.75) to the seeded demo student's enrollment and removes it.
async function withClient<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
const cleanup = () =>
  withClient(async (c) => {
    await c.query("delete from applications where cycle_id = 'e2e-entry-cycle'");
    await c.query("delete from application_cycles where id = 'e2e-entry-cycle'");
  });
test.beforeEach(async () => {
  await cleanup();
  await withClient(async (c) => {
    const year = (await c.query("select id from academic_years where code = '2026-2027'")).rows[0]
      .id;
    const enr = (
      await c.query(
        "select e.id, e.student_id, e.program_id from enrollments e join students s on s.id = e.student_id join persons p on p.id = s.person_id where p.email = 'student@dev.logos.test'",
      )
    ).rows[0];
    await c.query(
      `insert into application_cycles (id, academic_year_id, name, opens_on, closes_on, active, updated_at)
       values ('e2e-entry-cycle', $1, 'E2E Entry', '2026-01-01', '2026-12-31', true, now())`,
      [year],
    );
    await c.query(
      `insert into applications (id, reference, cycle_id, program_id, status, first_name, last_name, gender,
         birth_date, email, email_key, phone, address, school_name, graduation_year, average_grade,
         consent_at, token_hash, token_expires_at, updated_at, student_id, enrollment_id)
       values ('e2e-entry-app', 'AP-E2EENTRY', 'e2e-entry-cycle', $1, 'ENROLLED', 'Demo', 'Student', 'MALE',
         '2005-06-20', 'e2e-entry@example.com', 'e2e-entry@example.com', '1', 'A', 'Gjimnazi Entry', 2025, 8.75,
         now(), 'e2e-entry-hash', now() + interval '30 days', now(), $2, $3)`,
      [enr.program_id, enr.student_id, enr.id],
    );
  });
});
test.afterEach(cleanup);

test("AC-1..AC-6: the average of an enrolled student is reported and downloadable; a lecturer is refused", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/stu/entry-qualifications");
  await expect(
    page.getByRole("heading", { level: 1, name: "Kualifikimet e hyrjes" }),
  ).toBeVisible();
  await expect(page.getByTestId("entry-summary")).toContainText("8.75");
  const row = page.getByRole("row").filter({ hasText: "Demo Student" });
  await expect(row).toContainText("Gjimnazi Entry");
  await expect(row).toContainText("8.75");
  await expect(page.getByRole("row").filter({ hasText: "DEMO-BSC" }).first()).toBeVisible();

  await page.goto("/stu/entry-qualifications?program=NOPE");
  await expect(page.getByText("Nuk ka regjistrime për këto kritere.")).toBeVisible();

  const csv = await page.request.get("/stu/entry-qualifications/export?kind=list&format=csv");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("Gjimnazi Entry");
  const xlsx = await page.request.get("/stu/entry-qualifications/export?kind=programs&format=xlsx");
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");

  await page.context().clearCookies();
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/stu/entry-qualifications");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  expect((await page.request.get("/stu/entry-qualifications/export")).status()).toBe(403);
});
