import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

const SECRETARY = "secretary@dev.logos.test";

async function sql(text: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await client.query(text, params);
  } finally {
    await client.end();
  }
}

async function countUsers(email: string): Promise<number> {
  const res = await sql("select count(*)::int as n from users where email = $1", [email]);
  return res.rows[0].n;
}

test("AC-1: a signed-out visitor is redirected to /login with callbackUrl", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2F/);
});

test("AC-2/3: signing in through Keycloak lands on the page with the user's name", async ({
  page,
}) => {
  await signInAs(page, SECRETARY);
  // Generous timeout: the very first login also compiles pages in the dev server.
  await expect(page.getByTestId("current-user")).toContainText("Dev Secretary", {
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/localhost:\d+\/$/);
});

test("AC-5: the session cookie is httpOnly and sameSite=lax", async ({ page, context }) => {
  await signInAs(page, "quality@dev.logos.test");
  await expect(page.getByTestId("current-user")).toBeVisible({ timeout: 30_000 });
  const cookie = (await context.cookies()).find((c) => c.name.endsWith("session_token"));
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });
  // `secure` follows APP_URL: http in dev, so the browser would drop a Secure cookie.
  expect(cookie?.secure).toBe(process.env.APP_URL?.startsWith("https://") ?? false);
});

test("AC-8: deactivating a signed-in user ends their session on the next request", async ({
  page,
}) => {
  const email = "erasmus@dev.logos.test";
  await signInAs(page, email);
  await expect(page.getByTestId("current-user")).toBeVisible({ timeout: 30_000 });
  try {
    await sql("update users set active = false where email = $1", [email]);
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
  } finally {
    await sql("update users set active = true where email = $1", [email]);
  }
});

test("AC-6: idle-expired and over-age sessions are rejected", async ({ page }) => {
  const email = "library@dev.logos.test";
  await signInAs(page, email);
  await expect(page.getByTestId("current-user")).toBeVisible({ timeout: 30_000 });

  // Idle: the sliding deadline is in the past.
  await sql(
    "update sessions set expires_at = now() - interval '1 minute' where user_id = (select id from users where email = $1)",
    [email],
  );
  await page.reload();
  await expect(page).toHaveURL(/\/login/);

  // Absolute: still inside the idle window but created more than SESSION_MAX_HOURS ago.
  await signInAs(page, email);
  await expect(page.getByTestId("current-user")).toBeVisible({ timeout: 30_000 });
  await sql(
    "update sessions set created_at = now() - interval '13 hours' where user_id = (select id from users where email = $1)",
    [email],
  );
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
});

test("AC-7: after sign-out Keycloak asks for credentials again", async ({ page }) => {
  await signInAs(page, SECRETARY);
  await page.getByRole("button", { name: /dil|sign out/i }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("button", { name: "Hyr" }).click();
  await expect(page.locator("#username")).toBeVisible(); // no SSO session left
});

test("AC-4: a Keycloak user without an app user gets /no-access and no row is created", async ({
  page,
}) => {
  await signInAs(page, "stranger@dev.logos.test");
  await expect(page).toHaveURL(/\/no-access/);
  await expect(page.getByRole("heading", { name: /nuk keni qasje|no access/i })).toBeVisible();
  expect(await countUsers("stranger@dev.logos.test")).toBe(0);
});

test("AC-8: a deactivated app user is refused", async ({ page }) => {
  await signInAs(page, "inactive@dev.logos.test");
  await expect(page).toHaveURL(/\/no-access/);
});
