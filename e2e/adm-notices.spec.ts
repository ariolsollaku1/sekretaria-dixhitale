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
    "delete from registration_notices where announcement_id in (select id from announcements where title like 'E2E%')",
  );
  await sql("delete from announcements where title like 'E2E%'");
  await sql("delete from fee_discounts where label like 'E2E%'");
  await sql("delete from fee_schedule_items where label like 'E2E%'");
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-1/3/4/5/7: a secretary writes and publishes a registration notice; a student reads the deadline, documents and the live preferential fee", async ({
  page,
}) => {
  // a fee with a preferential window that is running now, set by Finance (FIN-01)
  const program = (await sql("select id from study_programs where code = 'DEMO-BSC'")).rows[0]
    .id as string;
  const year = (await sql("select id from academic_years where code = '2026-2027'")).rows[0]
    .id as string;
  const item = (
    await sql(
      "insert into fee_schedule_items (id, program_id, academic_year_id, kind, label, amount, active, updated_at) values (md5(random()::text), $1, $2, 'OTHER', 'E2E tarifa', 1234.00, true, now()) returning id",
      [program, year],
    )
  ).rows[0].id as string;
  await sql(
    "insert into fee_discounts (id, item_id, label, kind, value, valid_from, valid_to) values (md5(random()::text), $1, 'E2E early', 'PERCENT', 15, '2020-01-01', '2999-12-31')",
    [item],
  );

  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/adm/notices/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Titulli").fill("E2E Regjistrimet");
  await page.getByLabel("Hyrje").fill("Hapen regjistrimet.");
  await page.locator("select[name=academicYearId]").selectOption({ label: "2026-2027" });
  await page.locator("select[name=programId]").selectOption(program);
  await page.getByLabel("Afati i regjistrimit").fill("2999-09-15");
  await page.getByLabel("Dokumentet e nevojshme").fill("E2E Diploma\nE2E Fotografi");
  await page.getByLabel("Pjesë nga kontrata e studentit").fill("E2E Neni 3");
  await page.getByRole("button", { name: "Ruaj si skicë" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E Regjistrimet" })).toBeVisible();
  await expect(page.getByText("E2E Diploma")).toBeVisible();

  await page.getByRole("button", { name: "Publiko", exact: true }).click();
  await expect(page.getByText("Publikuar").first()).toBeVisible();

  // the writers' list
  await page.goto("/adm/notices");
  await expect(page.getByRole("link", { name: "E2E Regjistrimet", exact: true })).toBeVisible();

  // a student reads the live data
  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/announcements");
  await page.getByRole("link", { name: "E2E Regjistrimet" }).click();
  await expect(page.getByText("E2E Diploma")).toBeVisible();
  await expect(page.getByText("E2E Fotografi")).toBeVisible();
  await expect(page.getByText("E2E Neni 3")).toBeVisible();
  await expect(page.getByText("1 234.00")).toBeVisible();
  await expect(page.getByText("−15%")).toBeVisible();
  await expect(page.getByText("Në fuqi tani")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ndrysho" })).toHaveCount(0);

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} ${v.nodes[0]?.target}`),
  ).toEqual([]);
});

test("AC-6: a lecturer and a student cannot reach the notice pages", async ({ page }) => {
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/adm/notices");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  await page.goto("/adm/notices/new");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();

  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/adm/notices");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
