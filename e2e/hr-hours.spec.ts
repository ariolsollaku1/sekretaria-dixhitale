import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

// HR-04: the test adds three held DEMO101 classes (2 h each) in the month before today for the dev
// lecturer (replacing any other classes, as the attendance e2e specs do) and removes them, the
// approval and the adjustments afterwards.
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
    await c.query("delete from hours_adjustments");
    await c.query("delete from hours_approvals");
    await c.query("delete from attendance_marks");
    await c.query("delete from class_sessions");
  });

test.beforeEach(async () => {
  await cleanup();
  await withDb(async (c) => {
    const a = await c.query(
      `select ta.id from teaching_assignments ta
         join plan_courses pc on pc.id = ta.plan_course_id
         join courses co on co.id = pc.course_id
        where co.code = 'DEMO101' order by ta.id limit 1`,
    );
    for (const day of [5, 12, 19])
      await c.query(
        `insert into class_sessions (id, assignment_id, date, start_minute, end_minute, hours, status, updated_at)
         values ($1, $2, (date_trunc('month', now() at time zone 'Europe/Tirane')::date - interval '1 month' + ($3::int - 1) * interval '1 day')::date,
                 600, 690, 2, 'HELD', now())`,
        [`e2e-hr04-${day}`, a.rows[0].id, day],
      );
  });
});
test.afterAll(cleanup);

test("AC-2, AC-12: a lecturer sees the hours of the month on a phone, and cannot open the readers' pages", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/hr/hours/mine");
  await expect(
    page.getByRole("heading", { level: 1, name: "Orët e mia të realizuara" }),
  ).toBeVisible();
  await expect(page.getByTestId("hours-months")).toBeVisible();
  await expect(page.getByTestId("total-heldHours")).toHaveText("6");
  await expect(page.getByTestId("hours-sessions").getByRole("listitem")).toHaveCount(3);
  const noOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(noOverflow).toBe(true);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);

  // forbidden: the readers' table and report
  await page.goto("/hr/hours");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  await page.goto("/hr/hours/report");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});

test("AC-3..AC-10: the head of department adjusts, approves and reopens a lecturer's month", async ({
  page,
}) => {
  await signInAs(page, "head-of-department@dev.logos.test");
  await page.goto("/hr/hours");
  await expect(page.getByRole("heading", { level: 1, name: "Orët e realizuara" })).toBeVisible();
  await page.getByRole("link", { name: "Lektor Demo" }).first().click();
  await expect(page.getByTestId("total-heldHours")).toHaveText("6");
  await expect(page.getByTestId("total-total")).toHaveText("6");

  // an adjustment with a reason raises the total
  await page.getByLabel("Orë (+/-)").fill("2");
  await page.locator("#adj-reason").fill("Zëvendësim i një koleg");
  await page.getByRole("button", { name: "Shto rregullimin" }).click();
  await expect(page.getByTestId("total-total")).toHaveText("8");
  await expect(page.getByTestId("hours-adjustments")).toContainText("Zëvendësim");

  // approve: the month becomes approved and takes no more adjustments
  await page.getByRole("button", { name: "Mirato muajin" }).click();
  await expect(page.getByText("Miratuar", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Shto rregullimin" })).toHaveCount(0);

  // reopen needs a reason
  await page.locator("#reopen-reason").fill("Korrigjim");
  await page.getByRole("button", { name: "Rihap muajin" }).click();
  await expect(page.getByText("Rihapur", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Shto rregullimin" })).toBeVisible();
});

test("AC-4, AC-11: HR reads the course report with PAE and PAK totals but cannot approve; students are refused", async ({
  page,
}) => {
  await signInAs(page, "hr@dev.logos.test");
  await page.goto("/hr/hours/report");
  await expect(
    page.getByRole("heading", { level: 1, name: "Orët e realizuara sipas lëndës" }),
  ).toBeVisible();
  await expect(page.getByTestId("cat-PAE")).toHaveText("6");
  await expect(page.getByText("DEMO101").first()).toBeVisible();

  await page.goto("/hr/hours");
  await page.getByRole("link", { name: "Lektor Demo" }).first().click();
  await expect(page.getByRole("button", { name: "Mirato muajin" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Shto rregullimin" })).toBeVisible();

  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  for (const path of ["/hr/hours", "/hr/hours/mine", "/hr/hours/report"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  }
});
