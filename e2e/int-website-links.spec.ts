import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

// Published definitions are frozen by a trigger: e2e rows (keys "e2e-int06-…") are inserted and
// removed with it switched off, like forms.spec.ts does.
async function withDb(sql: string[]) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("alter table form_definitions disable trigger user");
    for (const s of sql) await client.query(s);
    await client.query("alter table form_definitions enable trigger user");
    await client.query("commit");
  } finally {
    await client.end();
  }
}
const def = (title: string) =>
  JSON.stringify({
    title: { sq: title },
    description: { sq: `Përshkrim për ${title}` },
    fields: [{ key: "name", type: "text", label: { sq: "Emri" }, required: true }],
    workflow: {
      initial: "new",
      states: [
        { key: "new", label: { sq: "E re" } },
        { key: "done", label: { sq: "Mbyllur" }, final: true },
      ],
      transitions: [{ from: "new", to: "done" }],
    },
  });
const row = (key: string, audience: string, status: string, title: string) =>
  `insert into form_definitions (id, key, version, status, audience, owner_roles, definition, updated_at${status === "PUBLISHED" ? ", published_at" : ""})
   values (gen_random_uuid()::text, '${key}', 1, '${status}', '${audience}', '{secretary}', '${def(title)}'::jsonb, now()${status === "PUBLISHED" ? ", now()" : ""})`;
const cleanup = () => withDb(["delete from form_definitions where key like 'e2e-int06-%'"]);

test.beforeEach(async () => {
  await cleanup();
  await withDb([
    row("e2e-int06-publik", "PUBLIC", "PUBLISHED", "E2E Formular publik"),
    row("e2e-int06-brendshem", "AUTHENTICATED", "PUBLISHED", "E2E Formular me hyrje"),
    row("e2e-int06-skice", "PUBLIC", "DRAFT", "E2E Formular skicë"),
  ]);
});
test.afterEach(cleanup);

test("AC-1..AC-4: a visitor finds public forms on the index without login", async ({ page }) => {
  await page.goto("/f");
  await expect(page).toHaveURL(/\/f$/); // not redirected to /login
  await expect(
    page.getByRole("heading", { level: 1, name: "Formularët e hapur për të gjithë" }),
  ).toBeVisible();
  await expect(page.getByText("Përshkrim për E2E Formular publik")).toBeVisible();
  // forbidden-for-visitors forms and drafts are not listed
  await expect(page.getByText("E2E Formular me hyrje")).toHaveCount(0);
  await expect(page.getByText("E2E Formular skicë")).toHaveCount(0);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await page.getByRole("link", { name: "E2E Formular publik" }).click();
  await expect(page).toHaveURL(/\/f\/e2e-int06-publik$/);
  await expect(page.getByRole("heading", { level: 1, name: "E2E Formular publik" })).toBeVisible();
  // an authenticated-only or unpublished key is not served publicly
  expect((await page.goto("/f/e2e-int06-brendshem"))?.status()).toBe(404);
  expect((await page.goto("/f/e2e-int06-skice"))?.status()).toBe(404);
});

test("AC-5: the sysadmin sees the addresses", async ({ page }) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/admin/forms/links");
  await expect(
    page.getByRole("heading", { level: 1, name: "Lidhjet për faqen e internetit" }),
  ).toBeVisible();
  await expect(page.getByTestId("link-index")).toHaveText(/\/f$/);
  await expect(page.getByTestId("link-e2e-int06-publik")).toHaveText(/\/f\/e2e-int06-publik$/);
  await expect(page.getByTestId("link-e2e-int06-brendshem")).toHaveCount(0);
});

test("AC-5 forbidden: a student cannot open the website links page", async ({ page }) => {
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/admin/forms/links");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  await expect(page.getByTestId("link-index")).toHaveCount(0);
});
