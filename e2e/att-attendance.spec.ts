import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

// Remove the sessions (and their marks) the test creates; nothing else uses them yet.
async function cleanup() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("delete from attendance_marks");
    await client.query("delete from class_sessions");
  } finally {
    await client.end();
  }
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

const tirane = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Tirane" }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );

async function signInFresh(page: Page, email: string) {
  await page.context().clearCookies();
  await signInAs(page, email);
}

test("AC-2..AC-5, 7, 10, 11: the lecturer records absences; the student sees them; the Secretariat corrects late with a reason", async ({
  page,
}) => {
  // --- the lecturer creates classes from the timetable and by hand
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/att/mine");
  await page.waitForLoadState("networkidle");
  await page.locator("#gen-from").fill(tirane(-20));
  await page.locator("#gen-to").fill(tirane(0));
  await page.getByRole("button", { name: "Krijo orët" }).click();
  await expect(page.getByText(/U krijuan \d+ orë/)).toBeVisible();
  await page.waitForSelector("[data-sonner-toast]", { state: "detached" });

  await page.locator("#ex-date").fill(tirane(0));
  await page.locator("#ex-start").fill("14:00");
  await page.locator("#ex-end").fill("14:45");
  await page.locator("#ex-topic").fill("E2E extra class");
  await page.getByRole("button", { name: "Shto orën" }).click();
  await expect(page.getByText("Ora u shtua")).toBeVisible();
  await page.waitForSelector("[data-sonner-toast]", { state: "detached" });

  // --- today's class: mark the demo student absent, with the page working at phone width
  await page.setViewportSize({ width: 360, height: 800 });
  await page
    .locator("li")
    .filter({ hasText: "E2E extra class" })
    .getByRole("link", { name: /Hap/ })
    .click();
  await page.waitForLoadState("networkidle");
  const student = page.getByRole("group", { name: /Student Demo/ });
  await expect(student).toBeVisible();
  await student.getByLabel("Mungon").check();
  await student.getByLabel("Shënim").fill("Sick");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Ruaj dhe shëno si të zhvilluar" }).click();
  await expect(page.getByText("Prania u ruajt")).toBeVisible();
  await page.waitForSelector("[data-sonner-toast]", { state: "detached" });
  await page.reload();
  await expect(page.getByText("E zhvilluar").first()).toBeVisible();
  await expect(
    page.getByRole("group", { name: /Student Demo/ }).getByLabel("Mungon"),
  ).toBeChecked();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- the oldest class is outside the 7-day window: the lecturer cannot save
  await page.goto("/att/mine");
  await page.waitForLoadState("networkidle");
  await page
    .locator("li")
    .filter({ hasText: "DEMO101" })
    .last()
    .getByRole("link", { name: /Hap/ })
    .click();
  await expect(page.getByText(/Afati për futjen e pranisë/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Ruaj dhe shëno si të zhvilluar" })).toHaveCount(0);
  const oldUrl = page.url();

  // --- the student sees their own absence, and has no lecturer pages
  await signInFresh(page, "student@dev.logos.test");
  await page.goto("/att/absences");
  const row = page.locator("li").filter({ hasText: "DEMO101" });
  await expect(row).toContainText("Mungon");
  await expect(row).not.toContainText("Sick");
  await page.goto("/att/mine");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  await page.goto(oldUrl);
  await expect(page.getByRole("heading", { level: 1, name: "Faqja nuk u gjet" })).toBeVisible();

  // --- the Secretariat corrects the old class: a reason is required
  await signInFresh(page, "secretary@dev.logos.test");
  await page.goto(oldUrl);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Ruaj dhe shëno si të zhvilluar" }).click();
  await expect(page.getByText("Kjo fushë është e detyrueshme.")).toBeVisible();
  await page.getByLabel("Arsyeja e ndryshimit").fill("Lecturer reported it late");
  await page.getByRole("button", { name: "Ruaj dhe shëno si të zhvilluar" }).click();
  await expect(page.getByText("Prania u ruajt")).toBeVisible();
  await page.reload();
  await expect(page.getByText("E zhvilluar").first()).toBeVisible();
});

test("AC-11: readers see the group's classes but cannot record; finance has no access", async ({
  page,
}) => {
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/att/mine");
  await page.waitForLoadState("networkidle");
  await page.locator("#ex-date").fill(tirane(0));
  await page.locator("#ex-topic").fill("E2E reader class");
  await page.getByRole("button", { name: "Shto orën" }).click();
  await expect(page.getByText("Ora u shtua")).toBeVisible();

  await signInFresh(page, "head-of-department@dev.logos.test");
  await page.goto("/att/sessions");
  await page.waitForLoadState("networkidle");
  const group = await page
    .locator("#att-group option", { hasText: "DEMO-BSC" })
    .first()
    .getAttribute("value");
  await page.goto(`/att/sessions?group=${group}`);
  const item = page.locator("li").filter({ hasText: "E2E reader class" });
  await expect(item).toBeVisible();
  await expect(page.getByRole("button", { name: "Krijo orët" })).toHaveCount(0);
  await item.getByRole("link", { name: /Hap/ }).click();
  await expect(page.getByRole("button", { name: "Ruaj dhe shëno si të zhvilluar" })).toHaveCount(0);

  await signInFresh(page, "finance@dev.logos.test");
  await page.goto("/att/sessions");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
