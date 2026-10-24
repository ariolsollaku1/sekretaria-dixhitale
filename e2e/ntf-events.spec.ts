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
  await sql(
    "delete from notifications where link in (select '/events/' || id from events where title like 'E2E%')",
  );
  await sql(
    "delete from event_registrations where event_id in (select id from events where title like 'E2E%')",
  );
  await sql("delete from events where title like 'E2E%'");
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-3..AC-7/11: a secretary publishes an event with one place; a student registers and cancels; a lecturer finds it full", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/events/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Titulli").fill("E2E Workshop");
  await page.getByLabel("Përshkrimi").fill("Workshop praktik.\nJeni të ftuar.");
  await page.getByLabel("Vendi", { exact: true }).fill("Salla 3");
  await page.getByLabel("Fillon", { exact: true }).fill("2099-06-10T18:30");
  await page.getByLabel("Vende", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Ruaj si skicë" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E Workshop" })).toBeVisible();
  await expect(page.getByText("Skicë").first()).toBeVisible();
  const detailUrl = page.url();

  // a draft is invisible to a student
  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  expect((await page.goto(detailUrl))?.status()).toBe(404);

  // publish
  await page.context().clearCookies();
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto(detailUrl);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Publiko", exact: true }).click();
  await expect(page.getByText("Publikuar").first()).toBeVisible();

  // the student registers
  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/events");
  await page.getByRole("link", { name: "E2E Workshop" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Regjistrohu" }).click();
  await expect(page.getByText("Jeni i regjistruar për këtë ngjarje.")).toBeVisible();
  // the page does not show who else registered
  await expect(page.getByRole("link", { name: "Të regjistruarit" })).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} ${v.nodes[0]?.target}`),
  ).toEqual([]);
  // the confirmation arrived in the bell list
  await page.goto("/notifications");
  await expect(page.getByText("Jeni regjistruar: E2E Workshop")).toBeVisible();

  // a lecturer finds the event full and cannot register
  await page.context().clearCookies();
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto(detailUrl);
  await expect(page.getByText("Të gjitha vendet janë zënë.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Regjistrohu" })).toHaveCount(0);

  // the secretary sees the attendee
  await page.context().clearCookies();
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto(detailUrl.replace(/\/events\/(.+)$/, "/events/attendees?event=$1"));
  await expect(page.getByText("student@dev.logos.test")).toBeVisible();

  // the student cancels; the place is free again
  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  await page.goto(detailUrl);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Anulo regjistrimin" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Anulo regjistrimin" }).click();
  await expect(page.getByRole("button", { name: "Regjistrohu" })).toBeVisible();
  expect((await sql("select 1 from event_registrations where status = 'CANCELLED'")).rowCount).toBe(
    1,
  );
});

test("AC-10/12: students and lecturers cannot organise or see attendees", async ({ page }) => {
  for (const who of ["student", "lecturer"]) {
    await page.context().clearCookies();
    await signInAs(page, `${who}@dev.logos.test`);
    await page.goto("/events");
    await expect(page.getByRole("link", { name: "Ngjarje e re" })).toHaveCount(0);
    for (const path of ["/events/new", "/events/attendees", "/events/manage"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
    }
  }
  expect((await sql("select 1 from events where title like 'E2E%'")).rowCount).toBe(0);
});
