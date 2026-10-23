import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

// Remove what the test adds; the seeded Monday slot stays.
async function cleanup() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("delete from timetable_entries where room = 'E2E-ROOM' or weekday = 3");
  } finally {
    await client.end();
  }
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-1..AC-5, 7: the Secretariat adds a slot and is stopped by a clash; others read; lecturer and student see their own", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/cal/timetable");
  const group = await page
    .locator("#tt-group option", { hasText: "DEMO-BSC" })
    .first()
    .getAttribute("value");
  await page.goto(`/cal/timetable?group=${group}`);
  await page.waitForLoadState("networkidle");
  const monday = page.getByRole("region", { name: "E hënë" });
  await expect(monday).toContainText("08:00–09:30");
  await expect(monday).toContainText("DEMO101");

  // a second slot on Monday that overlaps the first: refused, with the reason
  await page.locator("#new-st").fill("09:00");
  await page.locator("#new-en").fill("10:00");
  await page.getByRole("button", { name: "Shto orë" }).click();
  await expect(page.getByText(/Përplasje me orë ekzistuese/).first()).toBeVisible();
  await expect(page.getByText(/i njëjti grup/).first()).toBeVisible();

  // Wednesday is free
  await page.locator("#new-wd").selectOption("3");
  await page.locator("#new-rm").fill("E2E-ROOM");
  await page.getByRole("button", { name: "Shto orë" }).click();
  await expect(page.getByRole("region", { name: "E mërkurë" })).toContainText("E2E-ROOM");

  // the room view finds it
  await page.goto("/cal/timetable/room?room=e2e-room");
  await expect(page.getByRole("region", { name: "E mërkurë" })).toContainText("DEMO101");

  // finance reads but has no editor
  await page.context().clearCookies();
  await signInAs(page, "finance@dev.logos.test");
  await page.goto(`/cal/timetable?group=${group}`);
  await expect(page.getByRole("region", { name: "E hënë" })).toContainText("DEMO101");
  await expect(page.getByRole("button", { name: "Shto orë" })).toHaveCount(0);

  // the lecturer and the student see their own timetable; neither gets the group page
  for (const who of ["lecturer", "student"]) {
    await page.context().clearCookies();
    await signInAs(page, `${who}@dev.logos.test`);
    await page.goto("/cal/timetable/mine");
    await expect(page.getByRole("region", { name: "E hënë" })).toContainText("DEMO101");
    await page.goto("/cal/timetable");
    await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  }
});
