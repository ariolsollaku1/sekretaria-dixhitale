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
  await sql("delete from announcements where title like 'E2E%'");
  await sql("delete from calendar_events where title like 'E2E%'");
}
test.beforeEach(async () => {
  await cleanup();
  await sql(
    `insert into announcements (id, title, body, status, audience, publish_at, created_at, updated_at)
     values ('e2e-stu03-a', 'E2E Njoftim për studentët', 'Tekst', 'PUBLISHED', 'STUDENTS', now() - interval '1 hour', now(), now())`,
  );
  await sql(
    `insert into calendar_events (id, academic_year_id, title, type, start_date, end_date, audience, active, created_at, updated_at)
     select 'e2e-stu03-e', id, 'E2E Afati i dorëzimit', 'DEADLINE', current_date + 1, current_date + 1, 'ALL', true, now(), now()
     from academic_years where status = 'CURRENT' limit 1`,
  );
});
test.afterEach(cleanup);

test("AC-1..AC-7, 10: a student sees studies, dates, announcements and shortcuts on the portal home; others are refused", async ({
  page,
}) => {
  await signInAs(page, "student@dev.logos.test");
  // the dashboard widget leads to the portal
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Studimet e mia" })).toBeVisible();
  await page.getByRole("link", { name: "Hap portalin tim" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Portali i studentit" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Studimet e mia" })).toBeVisible();
  await expect(page.getByText("DEMO-BSC").first()).toBeVisible();
  await expect(page.getByText("Aktiv").first()).toBeVisible();
  await expect(page.getByText(/Të dhënat tuaja shfaqen këtu vetëm për lexim/)).toBeVisible();
  await expect(page.getByText("E2E Afati i dorëzimit")).toBeVisible();
  await expect(
    page.getByTestId("announcements").getByText("E2E Njoftim për studentët"),
  ).toBeVisible();
  await expect(page.getByTestId("unread")).toBeVisible();
  const shortcuts = page.getByRole("region", { name: "Shkurtore" });
  await expect(shortcuts.getByRole("link", { name: "Orari im" })).toBeVisible();
  await expect(shortcuts.getByRole("link", { name: "Kalendari akademik" })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);

  // forbidden: staff have no student portal
  await page.context().clearCookies();
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/stu/home");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
