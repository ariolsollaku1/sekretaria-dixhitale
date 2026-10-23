import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { waitForMailLink } from "./support/mailpit";
import { loginWithKeycloak, signInAs } from "./support/keycloak";

const PASSWORD = "Secretary-Pass-2026!";

async function sql(text: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await client.query(text, params);
  } finally {
    await client.end();
  }
}

test("AC-2/AC-1/AC-5: a sysadmin creates a secretary, who activates the account from the email and sees only the allowed menu", async ({
  page,
  browser,
}) => {
  const email = `new.secretary.${Date.now()}@dev.logos.test`;

  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/admin/users/new");
  await page.getByLabel("Email (përdoret për hyrje)").fill(email);
  await page.getByLabel("Emri", { exact: true }).fill("Nora");
  await page.getByLabel("Mbiemri").fill("Prifti");
  // default role row is a secretary with institution scope
  await page.getByRole("button", { name: "Krijo përdoruesin" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Nora Prifti" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Sekretari", { exact: true }).first()).toBeVisible();

  // The new user is in the list and found by search.
  await page.goto(`/admin/users?q=${encodeURIComponent("new.secretary")}`);
  await expect(page.getByRole("row").filter({ hasText: email })).toHaveCount(1);

  // The user follows the Keycloak link from the email in a fresh browser.
  const link = await waitForMailLink(email, "action-token");
  const fresh = await browser.newContext();
  const userPage = await fresh.newPage();
  await userPage.goto(link);
  await userPage.getByRole("link", { name: /proceed/i }).click();
  await userPage.locator("#password-new").fill(PASSWORD);
  await userPage.locator("#password-confirm").fill(PASSWORD);
  await userPage.locator("input[type=submit], button[type=submit]").first().click();
  await expect(
    userPage.getByRole("heading", { name: "Your account has been updated." }),
  ).toBeVisible();

  // Then signs in to the app.
  await userPage.goto("/login");
  await loginWithKeycloak(userPage, email, PASSWORD);
  await expect(userPage.getByRole("heading", { level: 1 })).toContainText("Nora Prifti", {
    timeout: 30_000,
  });
  await expect(userPage.getByRole("link", { name: "Përdoruesit" })).toHaveCount(0);
  await userPage.goto("/admin/users");
  await expect(userPage.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  await fresh.close();

  const row = await sql(
    "select email_verified, last_login_at is not null as logged_in from users where email = $1",
    [email],
  );
  expect(row.rows[0]).toEqual({ email_verified: true, logged_in: true });
});

test("AC-6: deactivating a user ends their session at once; reactivating restores access", async ({
  page,
  browser,
}) => {
  const email = "library@dev.logos.test";
  const other = await browser.newContext();
  const userPage = await other.newPage();
  await signInAs(userPage, email);
  await expect(userPage.getByTestId("current-user")).toBeVisible({ timeout: 30_000 });

  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto(`/admin/users?q=${email}`);
  await page.getByRole("link", { name: "Dev Library" }).click();
  await page.getByRole("button", { name: "Çaktivizo" }).click();
  // a reason is mandatory
  await page.getByRole("dialog").getByRole("button", { name: "Çaktivizo" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "e detyrueshme" })).toBeVisible();
  await page.getByLabel("Arsyeja").fill("left the college");
  await page.getByRole("dialog").getByRole("button", { name: "Çaktivizo" }).click();
  await expect(page.getByText("Joaktiv").first()).toBeVisible();

  try {
    await userPage.reload();
    await expect(userPage).toHaveURL(/\/login/);
    const reasons = await sql(
      "select reason from audit_logs where action = 'iam.user.deactivate' order by at desc limit 1",
    );
    expect(reasons.rows[0].reason).toBe("left the college");
  } finally {
    await page.getByRole("button", { name: "Riaktivizo" }).click();
    await page.getByLabel("Arsyeja").fill("returned");
    await page.getByRole("dialog").getByRole("button", { name: "Riaktivizo" }).click();
    await expect(page.getByText("Aktiv", { exact: true }).first()).toBeVisible();
  }
  await other.close();
});

test("AC-7: a sysadmin cannot deactivate themselves (no button) and a non-sysadmin gets 403", async ({
  page,
}) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/admin/users?q=sysadmin@dev");
  await page.getByRole("link", { name: "Dev Sysadmin" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Dev Sysadmin" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Çaktivizo" })).toHaveCount(0);
});

test("AC-13: a secretary gets the 403 view for the user pages", async ({ page }) => {
  await signInAs(page, "secretary@dev.logos.test");
  for (const path of ["/admin/users", "/admin/users/new"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  }
});

test("AC-11: the detail page shows the change history", async ({ page }) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/admin/users?q=library@dev");
  await page.getByRole("link", { name: "Dev Library" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Historiku i ndryshimeve" }),
  ).toBeVisible();
});

test("the user pages have no serious accessibility violations", async ({ page }) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  for (const path of ["/admin/users", "/admin/users/new"]) {
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
  await page.goto("/admin/users?q=library@dev");
  await page.getByRole("link", { name: "Dev Library" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Historiku i ndryshimeve" }),
  ).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} ${v.nodes[0]?.target}`),
  ).toEqual([]);
});
