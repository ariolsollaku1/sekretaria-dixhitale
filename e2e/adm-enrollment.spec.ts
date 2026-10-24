import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

// The test inserts its own cycle and applications (the public form is covered by adm-applications)
// and removes them with the students they created.
async function cleanup() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const persons = "(select id from persons where last_name like 'E2E%')";
    const students = `(select id from students where person_id in ${persons})`;
    const enrollments = `(select id from enrollments where student_id in ${students})`;
    await client.query(
      "delete from applications where cycle_id in (select id from application_cycles where name like 'E2E%')",
    );
    await client.query("delete from application_cycles where name like 'E2E%'");
    await client.query(`delete from year_registrations where enrollment_id in ${enrollments}`);
    await client.query(
      `delete from enrollment_status_events where enrollment_id in ${enrollments}`,
    );
    await client.query(`delete from enrollments where student_id in ${students}`);
    await client.query(`delete from students where person_id in ${persons}`);
    await client.query("delete from persons where last_name like 'E2E%'");
  } finally {
    await client.end();
  }
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

async function seedApplications(names: string[]) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const year = (await client.query("select id from academic_years where code = '2026-2027'"))
      .rows[0].id;
    const program = (await client.query("select id from study_programs where code = 'DEMO-BSC'"))
      .rows[0].id;
    await client.query(
      `insert into application_cycles (id, academic_year_id, name, opens_on, closes_on, active, updated_at)
       values ('e2e-cycle', $1, 'E2E Enrollment', '2026-01-01', '2026-12-31', true, now())`,
      [year],
    );
    for (const [i, name] of names.entries()) {
      await client.query(
        `insert into applications (id, reference, cycle_id, program_id, status, first_name, last_name, gender,
           birth_date, national_id, email, email_key, phone, address, school_name, graduation_year, average_grade,
           consent_at, token_hash, token_expires_at, updated_at)
         values ($1, $2, 'e2e-cycle', $3, 'ACCEPTED', 'Ana', $4, 'FEMALE', '2007-03-14', $5, $6, $6, '+355 69 000 0000',
           'Rr. Kavajes 1', 'Gjimnazi', 2025, 9.25, now(), $7, now() + interval '30 days', now())`,
        [
          `e2e-app-${i}`,
          `AP-E2E0000${i}`,
          program,
          name,
          `E2E-ID-${i}`,
          `e2e-enroll-${i}@example.com`,
          `e2e-hash-${i}`,
        ],
      );
    }
  } finally {
    await client.end();
  }
}

test("AC-2, 7, 8, 9: a secretary enrolls one candidate and a list of candidates", async ({
  page,
}) => {
  await seedApplications(["E2EHoxha", "E2EBerisha", "E2EKola"]);
  await signInAs(page, "secretary@dev.logos.test");

  // --- one candidate: confirm the data, choose cohort and group, enroll
  await page.goto("/adm/applications");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "AP-E2E00000" }).click();
  await expect(page.getByTestId("enroll-form")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Mbiemri", { exact: true }).fill("E2EHoxhaKonfirmuar");
  await page.getByLabel("Kohorta").selectOption({ index: 1 });
  await page.getByLabel("Grupi").selectOption({ index: 1 });
  await expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations.filter(
      (v) => ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await page.getByRole("button", { name: "Regjistro", exact: true }).click();
  await expect(page.getByTestId("enrolled-note")).toContainText("Regjistruar më");
  await page.getByRole("link", { name: "Hap kartelën e studentit" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Ana E2EHoxhaKonfirmuar" }),
  ).toBeVisible();

  // --- the rest in bulk
  await page.goto("/adm/enrollment");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("bulk-form")).toBeVisible();
  await expect(page.getByRole("cell", { name: "AP-E2E00000" })).toHaveCount(0);
  await page.getByLabel("AP-E2E00001").check();
  await page.getByLabel("AP-E2E00002").check();
  await page.getByLabel("Kohorta").selectOption({ index: 1 });
  await page.getByLabel("Grupi").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Regjistro 2 kandidatë" }).click();
  const result = page.getByTestId("bulk-result");
  await expect(result).toContainText("AP-E2E00001");
  await expect(result).toContainText("AP-E2E00002");
  await expect(result.getByText("U regjistrua")).toHaveCount(2);

  // both are students now
  await page.goto("/stu/students?q=E2E");
  await expect(page.getByRole("link", { name: /^\d{6}$/ })).toHaveCount(3);
});

test("AC-1: a lecturer cannot open the enrollment page", async ({ page }) => {
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/adm/enrollment");
  await expect(page.getByRole("heading", { name: "Nuk keni leje" })).toBeVisible();
  await page.goto("/adm/applications");
  await expect(page.getByRole("heading", { name: "Nuk keni leje" })).toBeVisible();
});
