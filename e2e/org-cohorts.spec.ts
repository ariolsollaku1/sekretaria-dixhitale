import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

async function cleanup() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      "delete from student_groups where cohort_id in (select id from cohorts where name like 'E2E%')",
    );
    await client.query("delete from cohorts where name like 'E2E%'");
  } finally {
    await client.end();
  }
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-1..AC-10: a secretary creates a cohort, creates its groups at the start of the year and manages them", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/org/cohorts/new");
  await page.waitForLoadState("networkidle");
  // option labels are "code — name"; pick by the code
  const programValue = await page
    .locator("#cohort-program option", { hasText: "DEMO-BSC" })
    .first()
    .getAttribute("value");
  await page.getByLabel("Programi").selectOption(programValue!);
  const yearValue = await page
    .locator("#cohort-year option", { hasText: "2026-2027" })
    .first()
    .getAttribute("value");
  await page.getByLabel("Viti i fillimit").selectOption(yearValue!);
  await page.getByLabel("Emri i kohortës").fill("E2E 2026");
  await page.getByRole("button", { name: "Krijo kohortën" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /DEMO-BSC · E2E 2026/ })).toBeVisible();
  const cohortUrl = page.url();

  // the start-of-year tool lists this cohort's missing group (the seeded cohort already has one)
  await page.goto("/org/groups/start-of-year");
  await expect(page.getByRole("row").filter({ hasText: "E2E 2026" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: /\b2026\b.*Grupi 1/ })).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Krijo \d+ grupe$/ }).click();
  await expect(page).toHaveURL(/\/org\/groups$/);
  await page.goto("/org/groups?program=DEMO-BSC");
  await expect(page.getByRole("row").filter({ hasText: "E2E 2026" })).toBeVisible();

  // idempotent: nothing left to create
  await page.goto("/org/groups/start-of-year");
  await expect(page.getByText(/Nuk ka grupe për t'u krijuar/)).toBeVisible();

  // rename the group and try to deactivate the cohort while the group is active
  await page.goto(cohortUrl);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Emri", { exact: true }).fill("Grupi A");
  await page.getByRole("button", { name: /^Ruaj/ }).first().click();
  await expect(page.getByText("U ruajt.")).toBeVisible();
  await page.getByRole("button", { name: "Çaktivizo" }).first().click();
  await page.getByRole("dialog").getByLabel("Arsyeja").fill("Nuk përdoret");
  await page.getByRole("dialog").getByRole("button", { name: "Çaktivizo" }).click();
  await expect(page.getByRole("dialog").getByText(/grupe aktive/)).toBeVisible();
  await page.keyboard.press("Escape");

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} ${v.nodes[0]?.target}`),
  ).toEqual([]);
});

test("AC-4: a plan followed by an active cohort cannot be archived", async ({ page }) => {
  await signInAs(page, "program-coordinator@dev.logos.test");
  await page.goto("/cur/plans?program=DEMO-BSC&status=APPROVED");
  await page.getByRole("link", { name: "DEMO-BSC" }).first().click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Arkivoje" }).click();
  await page.getByRole("dialog").getByLabel("Arsyeja").fill("Provë");
  await page.getByRole("dialog").getByRole("button", { name: "Arkivoje" }).click();
  await expect(page.getByText(/përdoret nga kohorta/)).toBeVisible();
});

test("AC-11/12: a coordinator reads only their program's cohorts; a student is refused", async ({
  page,
}) => {
  await signInAs(page, "program-coordinator@dev.logos.test");
  await page.goto("/org/cohorts");
  await expect(page.getByRole("heading", { level: 1, name: "Kohortet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Kohortë e re" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "DEMO-BSC" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "DEMO-MSC" })).toHaveCount(0);
  await page.goto("/org/cohorts/new");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();

  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/org/cohorts");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
