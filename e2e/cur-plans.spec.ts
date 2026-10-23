import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

// Approved plans are frozen by triggers; the cleanup of e2e data has to step around them.
async function cleanup() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("alter table plan_courses disable trigger user");
    await client.query("alter table curriculum_plans disable trigger user");
    await client.query(
      "delete from plan_courses where plan_id in (select id from curriculum_plans where notes like 'E2E%')",
    );
    await client.query("delete from curriculum_plans where notes like 'E2E%'");
    await client.query("alter table plan_courses enable trigger user");
    await client.query("alter table curriculum_plans enable trigger user");
    await client.query("commit");
  } finally {
    await client.end();
  }
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-2..8, 10, 11: a coordinator builds, approves and archives a plan; readers see it by status and scope", async ({
  page,
}) => {
  await signInAs(page, "program-coordinator@dev.logos.test");
  await page.goto("/cur/plans/new");
  await page.waitForLoadState("networkidle");
  // the coordinator is scoped to one program
  await expect(page.getByLabel("Programi").locator("option")).toHaveCount(1);
  await page.getByLabel("Shënime").fill("E2E plani");
  await page.getByRole("button", { name: "Krijo skicën" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /Plani DEMO-BSC, versioni 2/ }),
  ).toBeVisible();
  const planUrl = page.url();
  await page.waitForLoadState("networkidle");

  // add two courses; figures come from the catalog; totals warn about the missing credits
  await page.getByLabel("Shto lëndë nga katalogu").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Shto", exact: true }).click();
  await expect(page.locator("li").filter({ hasText: "DEMO101" }).first()).toBeVisible();
  await page.getByLabel("Shto lëndë nga katalogu").selectOption({ index: 2 });
  await page.getByLabel("Semestri", { exact: true }).first().selectOption("2");
  await page.getByRole("button", { name: "Shto", exact: true }).click();
  await expect(page.getByText(/kredite në vend të 30/).first()).toBeVisible();

  // change the credits of a row
  const credits = page.getByLabel("Kredite").first();
  await credits.fill("30");
  await page.getByRole("button", { name: /^Ruaj/ }).filter({ hasText: "DEMO" }).first().click();
  await expect(page.getByText("U ruajt.")).toBeVisible();

  // a draft is visible to the secretary but not to the lecturer
  await page.context().clearCookies();
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto(planUrl);
  await expect(
    page.getByRole("heading", { level: 1, name: /Plani DEMO-BSC, versioni 2/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Miratoje" })).toHaveCount(0);
  await page.context().clearCookies();
  await signInAs(page, "lecturer@dev.logos.test");
  expect((await page.goto(planUrl))?.status()).toBe(404);

  // approve: frozen, the editor is gone
  await page.context().clearCookies();
  await signInAs(page, "program-coordinator@dev.logos.test");
  await page.goto(planUrl);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Miratoje" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Miratoje" }).click();
  await expect(page.getByText("Miratuar", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Shto lëndë nga katalogu")).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} ${v.nodes[0]?.target}`),
  ).toEqual([]);

  // now the lecturer and the student can read it, and neither has write controls
  for (const who of ["lecturer", "student"]) {
    await page.context().clearCookies();
    await signInAs(page, `${who}@dev.logos.test`);
    await page.goto(planUrl);
    await expect(
      page.getByRole("heading", { level: 1, name: /Plani DEMO-BSC, versioni 2/ }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Arkivoje" })).toHaveCount(0);
  }

  // archive with a reason
  await page.context().clearCookies();
  await signInAs(page, "program-coordinator@dev.logos.test");
  await page.goto(planUrl);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Arkivoje" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Arkivoje" }).click();
  await expect(page.getByText("Shkruani arsyen.")).toBeVisible();
  await page.getByLabel("Arsyeja").fill("Zëvendësohet nga versioni 3");
  await page.getByRole("dialog").getByRole("button", { name: "Arkivoje" }).click();
  await expect(page.getByText("Arkivuar").first()).toBeVisible();
});

test("AC-11: a student cannot create plans and a lecturer sees only approved ones", async ({
  page,
}) => {
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/cur/plans");
  await expect(page.getByRole("heading", { level: 1, name: "Planet mësimore" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Plan i ri" })).toHaveCount(0);
  await page.goto("/cur/plans/new");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();

  await page.context().clearCookies();
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/cur/plans");
  await expect(page.getByRole("link", { name: "DEMO-BSC" }).first()).toBeVisible();
  await expect(page.getByRole("table").getByText("Skicë")).toHaveCount(0);
});
