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
async function cleanup() {
  await sql(
    "delete from message_recipients where message_id in (select id from messages where subject like 'E2E%')",
  );
  await sql("delete from messages where subject like 'E2E%'");
  await sql("delete from message_templates where name like 'E2E%'");
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
  // one deregistered student without a portal account
  await sql(
    "insert into persons (id, first_name, last_name, gender, birth_date, created_at, updated_at) values ('e2e-p-m', 'Ana', 'E2EMesazh', 'FEMALE', '2000-01-01', now(), now())",
  );
  await sql(
    "insert into students (id, person_id, created_at, updated_at) values ('e2e-s-m', 'e2e-p-m', now(), now())",
  );
  await sql(
    "insert into enrollments (id, student_id, program_id, cohort_id, registration_type, status, started_at, created_at, updated_at) select 'e2e-e-m', 'e2e-s-m', c.program_id, c.id, 'TRANSFER', 'DEREGISTERED', '2025-09-15', now(), now() from cohorts c where c.name = '2026' limit 1",
  );
  await sql(
    "insert into enrollment_status_events (id, enrollment_id, to_status, reason, effective_date, document_ref, created_at) values ('e2e-ev-m', 'e2e-e-m', 'DEREGISTERED', 'Arsye', '2026-10-02', 'D-1', now())",
  );
});
test.afterEach(cleanup);

test("AC-1..AC-5, AC-8, AC-9: a secretary messages a filtered list, sees the log; others are refused", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/stu/lists?list=deregistered");
  await page.getByRole("link", { name: "Dërgo mesazh këtyre personave" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mesazh i ri" })).toBeVisible();
  await expect(page.getByTestId("recipient-summary")).toContainText("1 personave");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Subjekti").fill("E2E Seancë provimesh");
  await page.getByLabel("Mesazhi").fill("Përshëndetje {firstName}, seanca fillon të hënën.");
  // save the wording as a template
  await page.getByLabel("Emri i shabllonit").fill("E2E shabllon seance");
  await page.getByRole("button", { name: "Ruaj si shabllon" }).click();
  await expect(page.locator("[data-sonner-toast]").first()).toContainText("Shablloni u ruajt");
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15000 });

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} ${v.nodes[0]?.target}`),
  ).toEqual([]);

  // unknown placeholders are refused
  await page.getByLabel("Mesazhi").fill("Përshëndetje {studentNumber}");
  await page.getByRole("button", { name: "Dërgo mesazhin" }).click();
  await page.getByRole("button", { name: "Dërgo", exact: true }).click();
  await expect(page.getByText("Në kllapa gjarpërore").first()).toBeVisible();
  await page.getByLabel("Mesazhi").fill("Përshëndetje {firstName}, seanca fillon të hënën.");

  await page.getByRole("button", { name: "Dërgo mesazhin" }).click();
  await page.getByRole("button", { name: "Dërgo", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E Seancë provimesh" })).toBeVisible();
  const detailUrl = page.url();
  // nobody in the list has a portal account, so the message is complete at once
  const row = page.getByRole("row").filter({ hasText: "E2EMesazh" });
  await expect(row).toContainText("Pa llogari në portal");
  await expect(page.getByText("Dërguar", { exact: true }).first()).toBeVisible();

  await page.goto("/messages");
  await expect(page.getByRole("link", { name: "E2E Seancë provimesh" })).toBeVisible();

  // the saved template is offered on the next message and can be archived
  await page.goto("/messages/templates");
  await expect(page.locator("p", { hasText: "E2E shabllon seance" })).toBeVisible();
  await page.getByRole("button", { name: /Arkivo\s+E2E shabllon seance/ }).click();
  await page.getByRole("button", { name: "Arkivo", exact: true }).click();
  await expect(page.locator("p", { hasText: "E2E shabllon seance" })).toHaveCount(0);

  // another sender cannot open it; a student and a lecturer cannot send at all
  await page.context().clearCookies();
  await signInAs(page, "head-of-department@dev.logos.test");
  const other = await page.goto(detailUrl);
  expect(other?.status()).toBe(404);

  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/messages");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  await page.goto("/messages/new?table=stu.lists");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();

  await page.context().clearCookies();
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/messages/templates");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
