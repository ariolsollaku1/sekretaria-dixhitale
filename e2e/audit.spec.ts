import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

const ENTITY_ID = `e2e-${Date.now()}`;

async function sql(text: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await client.query(text, params);
  } finally {
    await client.end();
  }
}

test.beforeAll(async () => {
  await sql(
    `insert into audit_logs (id, actor_type, action, entity_type, entity_id, before, after, reason, request_id)
     values ($1, 'SYSTEM', 'stu.student.update', 'Student', $2, '{"city":"Tiranë","nationalId":"***"}', '{"city":"Durrës","nationalId":"***"}', 'address corrected', 'req-e2e')`,
    [`id-${ENTITY_ID}`, ENTITY_ID],
  );
});

test("AC-6: a sysadmin filters by entity id, sees the entry and its field diff", async ({
  page,
}) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.getByRole("link", { name: "Evidenca" }).first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Evidenca e ndryshimeve" }),
  ).toBeVisible();

  await page.getByLabel("ID e entitetit").fill(ENTITY_ID);
  await page.getByRole("button", { name: "Filtro" }).click();
  await expect(page).toHaveURL(new RegExp(`entityId=${ENTITY_ID}`));
  const rows = page.getByRole("row").filter({ hasText: ENTITY_ID });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("stu.student.update");

  await rows.first().getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1, name: "Shënimi i evidencës" })).toBeVisible();
  await expect(page.getByRole("row", { name: /city/ })).toContainText("Tiranë");
  await expect(page.getByRole("row", { name: /city/ })).toContainText("Durrës");
  await expect(page.getByText("address corrected")).toBeVisible();
  // Sensitive values only ever appear masked.
  await expect(page.getByRole("row", { name: /nationalId/ })).toContainText("***");

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );
});

test("AC-6: the login that just happened is in the trail and filters by action prefix and actor", async ({
  page,
}) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/admin/audit?action=auth.&actor=sysadmin@dev");
  await expect(
    page.getByRole("row").filter({ hasText: "auth.session.login" }).first(),
  ).toBeVisible();
  await page.goto("/admin/audit?actor=nobody-matches-this");
  await expect(page.getByRole("heading", { name: "Asnjë rezultat" })).toBeVisible();
});

test("AC-6: a secretary gets the 403 view and no menu entry", async ({ page }) => {
  await signInAs(page, "secretary@dev.logos.test");
  await expect(page.getByRole("link", { name: "Evidenca" })).toHaveCount(0);
  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  await page.goto(`/admin/audit/id-${ENTITY_ID}`);
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
