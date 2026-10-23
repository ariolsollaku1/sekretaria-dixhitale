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
  await sql("delete from calendar_events where title like 'E2E%'");
  await sql("delete from calendar_feed_tokens");
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-1/5/7/8/14: a secretary creates, finds and cancels an event; a lecturer only reads", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/calendar");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Kalendari akademik" })).toBeVisible();
  await page.getByRole("link", { name: "Ngjarje e re" }).click();
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Titulli").fill("E2E Afati i dorëzimit");
  await page.getByLabel("Lloji").selectOption("DEADLINE");
  await page.getByLabel("Data e fillimit").fill("2026-10-14");
  await page.getByLabel("Data e mbarimit").fill("2026-10-14");
  await page.getByRole("button", { name: "Krijo ngjarjen" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "E2E Afati i dorëzimit" }),
  ).toBeVisible();

  // dates outside the year are refused by the server
  await page.getByLabel("Data e fillimit").fill("2026-08-01");
  await page.getByRole("button", { name: "Ruaj ndryshimet" }).click();
  await expect(page.getByText("Datat duhet të jenë brenda vitit akademik.")).toBeVisible();

  // agenda (by week), month and list show it
  await page.goto("/calendar");
  await expect(page.getByRole("link", { name: "E2E Afati i dorëzimit" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Java \d+/ }).first()).toBeVisible();
  await page.goto("/calendar?view=month&month=2026-10");
  await expect(page.getByRole("link", { name: "E2E Afati i dorëzimit" })).toBeVisible();
  await page.goto("/calendar?view=list");
  await expect(page.getByRole("link", { name: "E2E Afati i dorëzimit" })).toBeVisible();

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} ${v.nodes[0]?.target}`),
  ).toEqual([]);

  // lecturer: reads, no write controls
  await page.context().clearCookies();
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/calendar");
  await expect(page.getByRole("link", { name: "E2E Afati i dorëzimit" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ngjarje e re" })).toHaveCount(0);
  await page.goto("/calendar/events/new");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();

  // secretary cancels it; the lecturer no longer sees it
  await page.context().clearCookies();
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/calendar");
  await page.getByRole("link", { name: "E2E Afati i dorëzimit" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Anulo ngjarjen" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Anulo ngjarjen" }).click();
  await expect(page.getByText("Anuluar").first()).toBeVisible();
  await page.context().clearCookies();
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/calendar");
  await expect(page.getByRole("link", { name: "E2E Afati i dorëzimit" })).toHaveCount(0);
});

test("AC-12/13: a user creates a feed link that serves iCal until revoked", async ({ page }) => {
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/calendar");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Krijo lidhjen" }).click();
  const link = page.getByLabel("Lidhja juaj");
  await expect(link).toHaveValue(/\/api\/calendar\/[\w-]{43}\.ics$/);
  const path = new URL(await link.inputValue()).pathname;

  const ok = await page.request.get(path);
  expect(ok.status()).toBe(200);
  expect(await ok.text()).toContain("BEGIN:VCALENDAR");

  await page.getByRole("button", { name: "Fshi lidhjen" }).click();
  await expect(page.getByText("Lidhja u fshi.")).toBeVisible();
  expect((await page.request.get(path)).status()).toBe(404);
});

test("AC-10/11: copying into a year that already has events is refused", async ({ page }) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/calendar/copy");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Kopjo kalendarin" }).click();
  await expect(page.getByText("Viti ka tashmë ngjarje")).toBeVisible();
});
