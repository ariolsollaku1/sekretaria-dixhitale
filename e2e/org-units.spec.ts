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
  await sql("delete from departments where code like 'E2E-%'");
  await sql("delete from faculties where code like 'E2E-%'");
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-10/11: lists show the demo units; a secretary reads without write controls; a student is refused", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.getByRole("link", { name: "Fakultetet" }).first().click();
  await expect(page.getByRole("row").filter({ hasText: "DEMO-A" }).first()).toContainText(
    "Demo Faculty A",
  );
  await expect(page.getByRole("link", { name: "Fakultet i ri" })).toHaveCount(0);
  await page.goto("/org/departments?faculty=demo-a");
  await expect(page.getByRole("row").filter({ hasText: "DEMO-A1" })).toHaveCount(1);
  await expect(page.getByRole("row").filter({ hasText: "DEMO-B1" })).toHaveCount(0);
  await page.goto("/org/faculties/new");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();

  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/org/faculties");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});

test("AC-1/2/3/4/5/6: create, validate, duplicate, deactivate rules", async ({ page }) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/org/faculties/new");
  await page.getByLabel("Kodi").fill("!");
  await page.getByLabel("Emri", { exact: true }).fill("E2E Faculty");
  await page.getByRole("button", { name: "Krijo" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "2–12 karaktere" })).toBeVisible();

  await page.getByLabel("Kodi").fill("demo-a"); // duplicate of the seeded faculty, any case
  await page.getByRole("button", { name: "Krijo" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "përdoret tashmë" })).toBeVisible();

  await page.getByLabel("Kodi").fill("e2e-f");
  await page.getByRole("button", { name: "Krijo" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E-F — E2E Faculty" })).toBeVisible({
    timeout: 30_000,
  });

  // a department under it
  await page.goto("/org/departments/new");
  await page.getByLabel("Fakulteti").selectOption({ label: "E2E-F — E2E Faculty" });
  await page.getByLabel("Kodi").fill("E2E-D");
  await page.getByLabel("Emri", { exact: true }).fill("E2E Department");
  await page.getByRole("button", { name: "Krijo" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E-D — E2E Department" })).toBeVisible(
    { timeout: 30_000 },
  );

  // the faculty cannot be deactivated while the department is active
  await page.goto("/org/faculties?q=E2E-F");
  await page.getByRole("link", { name: "E2E-F" }).click();
  await page.getByRole("button", { name: "Çaktivizo" }).click();
  await page.getByLabel("Arsyeja").fill("test");
  await page.getByRole("dialog").getByRole("button", { name: "Çaktivizo" }).click();
  await expect(page.getByText("ka ende 1 departamente aktive")).toBeVisible();
  await page.keyboard.press("Escape");

  // deactivate the department first, then the faculty
  await page.goto("/org/departments?q=E2E-D");
  await page.getByRole("link", { name: "E2E-D" }).click();
  await page.getByRole("button", { name: "Çaktivizo" }).click();
  await page.getByLabel("Arsyeja").fill("closed");
  await page.getByRole("dialog").getByRole("button", { name: "Çaktivizo" }).click();
  await expect(page.getByText("Joaktiv").first()).toBeVisible();

  const rows = await sql("select code, active from departments where code = 'E2E-D'");
  expect(rows.rows).toEqual([{ code: "E2E-D", active: false }]);
  const audit = await sql(
    "select reason from audit_logs where action = 'org.department.deactivate' order by at desc limit 1",
  );
  expect(audit.rows[0].reason).toBe("closed");
});

test("AC-9: the department page shows its head of department", async ({ page }) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/org/departments?q=DEMO-A1");
  await page.getByRole("link", { name: "DEMO-A1" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Përgjegjësit e departamentit" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Dev Head Of Department" })).toBeVisible();
});

test("AC-8: the user role editor offers faculty and department scopes with the demo units", async ({
  page,
}) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/admin/users/new");
  await page.locator("#role-0-role").selectOption("secretary");
  await page.locator("#role-0-scope").selectOption("FACULTY");
  await expect(page.locator("#role-0-target")).toContainText("DEMO-A — Demo Faculty A");
  await page.locator("#role-0-role").selectOption("head_of_department");
  await expect(page.locator("#role-0-scope")).toHaveValue("DEPARTMENT");
  await expect(page.locator("#role-0-target")).toContainText(
    "DEMO-A / DEMO-A1 — Demo Department A1",
  );
});

test("the unit pages have no serious accessibility violations", async ({ page }) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  for (const path of [
    "/org/faculties",
    "/org/faculties/new",
    "/org/departments",
    "/org/departments/new",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      axe.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id} ${v.nodes[0]?.target}`),
    ).toEqual([]);
  }
});
