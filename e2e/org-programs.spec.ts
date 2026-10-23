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
  await sql("delete from study_programs where code like 'E2E-%'");
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-10/11: lists show the demo programs; a secretary reads without write controls; a student is refused", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.getByRole("link", { name: "Programet" }).first().click();
  await expect(page.getByRole("row").filter({ hasText: "DEMO-BSC" })).toContainText(
    "Cikli i parë (Bachelor)",
  );
  await expect(page.getByRole("row").filter({ hasText: "DEMO-MSC" })).toContainText(
    "Cikli i dytë (Master)",
  );
  await expect(page.getByRole("link", { name: "Program i ri" })).toHaveCount(0);

  await page.locator("#f-cycle").selectOption("SECOND");
  await page.getByRole("button", { name: "Filtro" }).first().click();
  await expect(page.getByRole("row").filter({ hasText: "DEMO-BSC" })).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: "DEMO-MSC" })).toHaveCount(1);

  await page.goto("/org/programs/new");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();

  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/org/programs");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});

test("AC-2/3/4/5/7: a sysadmin creates a Master program; durations follow the cycle; duplicates are refused; deactivation needs a reason", async ({
  page,
}) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/org/programs/new");
  await page.waitForLoadState("networkidle");

  // Bachelor only offers 3 years
  await expect(page.getByLabel("Kohëzgjatja").locator("option")).toHaveText(["3 vite"]);
  await page.getByLabel("Cikli").selectOption("SECOND");
  await expect(page.getByLabel("Kohëzgjatja").locator("option")).toHaveText(["1 vit", "2 vite"]);
  await expect(page.getByLabel("Lloji i Master-it")).toBeVisible();

  await page.getByLabel("Kodi").fill("e2e-msc");
  await page.getByLabel("Emri", { exact: true }).fill("E2E Master");
  await page.getByLabel("Kohëzgjatja").selectOption("2");
  await page.getByLabel("Lloji i Master-it").selectOption("PROFESSIONAL");
  await page.getByLabel("Kreditet totale").fill("0");
  await page.getByRole("button", { name: "Krijo" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "nga 1 në 600" })).toBeVisible();

  await page.getByLabel("Kreditet totale").fill("120");
  await page.getByRole("button", { name: "Krijo" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E-MSC — E2E Master" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Cikli i dytë (Master)").first()).toBeVisible();
  await expect(page.getByText("2 vite").first()).toBeVisible();

  // duplicate code
  await page.goto("/org/programs/new");
  await page.getByLabel("Kodi").fill("E2E-MSC");
  await page.getByLabel("Emri", { exact: true }).fill("Again");
  await page.getByLabel("Kreditet totale").fill("180");
  await page.getByRole("button", { name: "Krijo" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "përdoret tashmë" })).toBeVisible();

  // deactivate with a reason
  await page.goto("/org/programs?q=E2E-MSC");
  await page.getByRole("link", { name: "E2E-MSC" }).click();
  await page.getByRole("button", { name: "Çaktivizo" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Çaktivizo" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Arsyeja është e detyrueshme" }),
  ).toBeVisible();
  await page.getByLabel("Arsyeja").fill("not offered any more");
  await page.getByRole("dialog").getByRole("button", { name: "Çaktivizo" }).click();
  await expect(page.getByText("Joaktiv").first()).toBeVisible();
  const audit = await sql(
    "select reason from audit_logs where action = 'org.program.deactivate' order by at desc limit 1",
  );
  expect(audit.rows[0].reason).toBe("not offered any more");
});

test("AC-9: the program page shows its coordinator; AC-8: the role editor offers program scope", async ({
  page,
}) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/org/programs?q=DEMO-BSC");
  await page.getByRole("link", { name: "DEMO-BSC" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Koordinatorët e programit" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Dev Program Coordinator" })).toBeVisible();

  await page.goto("/admin/users/new");
  await page.locator("#role-0-role").selectOption("program_coordinator");
  await expect(page.locator("#role-0-scope")).toHaveValue("PROGRAM");
  await expect(page.locator("#role-0-target")).toContainText("DEMO-BSC");
});

test("the program pages have no serious accessibility violations", async ({ page }) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  for (const path of ["/org/programs", "/org/programs/new"]) {
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

test("editing a program saves (regression: edit forms must not require an id field)", async ({
  page,
}) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/org/programs?q=DEMO-MSC");
  await page.getByRole("link", { name: "DEMO-MSC" }).click();
  await page.waitForLoadState("networkidle");
  try {
    await page.getByLabel("Kreditet totale").fill("125");
    await page.getByRole("button", { name: "Ruaj ndryshimet" }).click();
    await expect(page.getByText("Ndryshimet u ruajtën.")).toBeVisible();
    expect(
      (await sql("select total_credits from study_programs where code = 'DEMO-MSC'")).rows[0]
        .total_credits,
    ).toBe(125);
  } finally {
    await sql("update study_programs set total_credits = 120 where code = 'DEMO-MSC'");
  }
});
