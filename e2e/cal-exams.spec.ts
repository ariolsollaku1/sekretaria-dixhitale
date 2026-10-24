import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

// Remove the sessions and exams the test creates (the dev seed has none).
async function cleanup() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("delete from exam_sitting_examiners");
    await client.query("delete from exam_sittings");
    await client.query("delete from exam_sessions");
  } finally {
    await client.end();
  }
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-1..AC-3, 6..8, 10: the Secretariat defines a session and an exam, publishes; the student sees it; others are refused", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/cal/exams");
  await page.waitForLoadState("networkidle");
  await page.locator("#ses-type").selectOption("WINTER");
  await page.locator("#ses-start").fill("2027-01-11");
  await page.locator("#ses-end").fill("2027-02-05");
  await page.getByRole("button", { name: "Shto sesionin" }).click();
  await expect(page).toHaveURL(/\/cal\/exams\/[a-z0-9]+$/);
  await page.waitForLoadState("networkidle");
  const sessionUrl = page.url();

  // a date outside the session is refused with the reason
  const course = await page
    .locator("#new-course option", { hasText: "DEMO101" })
    .first()
    .getAttribute("value");
  await page.locator("#new-course").selectOption(course!);
  await page.locator("#new-dt").fill("2027-03-01");
  await page.locator("#new-rm").fill("E2E-ROOM");
  await page.getByRole("button", { name: "Shto provimin" }).click();
  await expect(page.getByText(/brenda datave të sesionit/).first()).toBeVisible();

  // a valid date is accepted and appears in the schedule
  await page.locator("#new-dt").fill("2027-01-12");
  await page.getByRole("button", { name: "Shto provimin" }).click();
  const schedule = page.getByRole("table");
  await expect(schedule).toContainText("DEMO101");
  await expect(schedule).toContainText("09:00–11:00");
  await expect(schedule).toContainText("E2E-ROOM");
  await page.waitForSelector("[data-sonner-toast]", { state: "detached" });

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} ${v.nodes[0]?.target}`),
  ).toEqual([]);

  // not yet published: the student sees nothing
  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/cal/exams/mine");
  await expect(page.getByText("Nuk ka provime në orar.")).toBeVisible();

  // publish
  await page.context().clearCookies();
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto(sessionUrl);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Publiko orarin" }).click();
  await expect(page.getByRole("button", { name: "Hiq publikimin" })).toBeVisible();

  // the student sees the exam; staff read-only (finance) have no editor
  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/cal/exams/mine");
  await expect(page.getByRole("table")).toContainText("DEMO101");
  await expect(page.getByRole("table")).toContainText("E2E-ROOM");

  // forbidden: a student cannot open the session pages
  await page.goto(sessionUrl);
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  await page.goto("/cal/exams");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();

  await page.context().clearCookies();
  await signInAs(page, "finance@dev.logos.test");
  await page.goto(sessionUrl);
  await expect(page.getByRole("table")).toContainText("DEMO101");
  await expect(page.getByRole("button", { name: "Shto provimin" })).toHaveCount(0);
});
