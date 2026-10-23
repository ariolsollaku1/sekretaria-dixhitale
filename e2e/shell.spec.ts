import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

const USER = "student-affairs@dev.logos.test";

async function sql(text: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await client.query(text, params);
  } finally {
    await client.end();
  }
}

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

test.afterEach(async () => {
  await sql("update users set locale = null where email = $1", [USER]);
});

test("AC-1/10: the shell shows the dashboard with welcome message and empty widgets area", async ({
  page,
}) => {
  await signInAs(page, USER);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Përshëndetje, Dev Student Affairs",
  );
  await expect(page.getByRole("navigation", { name: "Navigimi kryesor" })).toBeVisible();
  await expect(page.getByText("Nuk ka ende kartela")).toBeVisible();
  // PLT-06 AC-7 + ORG-01 AC-9: years exist, so the selector is shown and defaults to the current one.
  await expect(page.getByLabel("Viti akademik")).toHaveValue(/.+/);
  await expect(page.getByLabel("Viti akademik").locator("option:checked")).toHaveText("2026-2027");
});

test("AC-4: switching to English changes labels and survives a reload", async ({ page }) => {
  await signInAs(page, USER);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Përshëndetje");
  await page.getByLabel("Gjuha").selectOption("en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hello, Dev Student Affairs");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hello");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const res = await sql("select locale from users where email = $1", [USER]);
  expect(res.rows[0].locale).toBe("en");
});

test("AC-3: at 360×740 the sidebar is a drawer and the page does not scroll sideways", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await signInAs(page, USER);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navigimi kryesor" })).toBeHidden();
  await page.getByRole("button", { name: "Hap menynë" }).click();
  const drawerNav = page.getByRole("dialog").getByRole("navigation", { name: "Navigimi kryesor" });
  await expect(drawerNav).toBeVisible();
  await drawerNav.getByRole("link", { name: "Paneli" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("AC-9: an unknown URL renders a styled 404 inside the shell", async ({ page }) => {
  await signInAs(page, USER);
  await page.goto("/no/such/page");
  await expect(page.getByRole("heading", { level: 1, name: "Faqja nuk u gjet" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navigimi kryesor" })).toBeVisible();
});

test("AC-11: keyboard users get a skip link and the pages have no serious axe violations", async ({
  page,
}) => {
  await page.goto("/login");
  await expectNoSeriousViolations(page);

  await signInAs(page, USER);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Kalo te përmbajtja" })).toBeFocused();
  await expectNoSeriousViolations(page);

  await page.goto("/no/such/page");
  await expectNoSeriousViolations(page);

  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await page.getByRole("button", { name: "Hap menynë" }).click();
  await expectNoSeriousViolations(page);
});
