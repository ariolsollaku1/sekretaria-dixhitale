import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

// Remove what the tests assign to the second demo course; the seeded assignment stays.
async function cleanup() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      "delete from teaching_assignments where plan_course_id in (select pc.id from plan_courses pc join courses c on c.id = pc.course_id where c.code = 'DEMO102')",
    );
  } finally {
    await client.end();
  }
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-1..AC-6, 9: a head of department assigns a lecturer; the board warns about what is missing", async ({
  page,
}) => {
  await signInAs(page, "head-of-department@dev.logos.test");
  await page.goto("/cur/teaching?program=DEMO-BSC");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Ngarkesa mësimore" })).toBeVisible();
  // DEMO102 is in the plan, year 1, semester 2 — nobody teaches it yet
  const card = page.locator("li").filter({ hasText: "DEMO102" }).first();
  await expect(card.getByText("Pa pedagog")).toBeVisible();
  await expect(page.getByText(/lëndë nuk kanë asnjë pedagog/)).toBeVisible();

  const lecturer = card.getByLabel("Pedagogu");
  const value = await lecturer
    .locator("option", { hasText: "Lektor" })
    .first()
    .getAttribute("value");
  await lecturer.selectOption(value!);
  await card.getByLabel("Lloji").selectOption("LAB");
  await card.getByRole("button", { name: "Cakto" }).click();
  await expect(card.getByText("Pa pedagog")).toHaveCount(0);
  await expect(card.getByLabel(/Orë të planifikuara Laborator/)).toHaveValue("15"); // from the plan

  // change the hours, then remove
  await card.getByLabel(/Orë të planifikuara Laborator/).fill("20");
  await card.getByRole("button", { name: "Ruaj" }).click();
  await expect(page.getByText("U ruajt.")).toBeVisible();
  await card.getByRole("button", { name: /^Hiq/ }).click();
  await expect(card.getByText("Pa pedagog")).toBeVisible();

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} ${v.nodes[0]?.target}`),
  ).toEqual([]);
});

test("AC-7/AC-8/AC-9: the list shows assignments; a lecturer sees only their own; a student is refused", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/cur/teaching/list");
  await expect(page.getByRole("row").filter({ hasText: "DEMO101" }).first()).toContainText(
    "Leksione",
  );

  await page.context().clearCookies();
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/cur/teaching/mine");
  await expect(page.getByRole("heading", { level: 1, name: "Lëndët e mia" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "DEMO101" })).toBeVisible();
  await page.goto("/cur/teaching");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();

  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/cur/teaching/mine");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
