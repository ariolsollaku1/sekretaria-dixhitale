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
  await sql("delete from stored_files where file_name like 'e2e-%'");
  await sql("delete from announcements where title like 'E2E%'");
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

const PDF = Buffer.from("%PDF-1.7 e2e announcement");

test("AC-1/3/5/6/9/11: a secretary drafts, attaches, publishes; staff read and download; a student cannot see it", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/announcements/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Titulli").fill("E2E Leksion i hapur");
  await page.getByLabel("Teksti").fill("Të enjten në sallën 3.\nJeni të ftuar.");
  await page.getByLabel("Kujt i drejtohet").selectOption("STAFF");
  await page
    .getByLabel("Shto skedar")
    .setInputFiles({ name: "e2e-orari.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByText(/e2e-orari\.pdf/).first()).toBeVisible();
  await page.getByRole("button", { name: "Ruaj si skicë" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E Leksion i hapur" })).toBeVisible();
  await expect(page.getByText("Skicë").first()).toBeVisible();

  // a draft is invisible to a lecturer
  await page.context().clearCookies();
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/announcements");
  await expect(page.getByRole("link", { name: "E2E Leksion i hapur" })).toHaveCount(0);

  // publish
  await page.context().clearCookies();
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/announcements/manage");
  await page.getByRole("link", { name: "E2E Leksion i hapur" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Publiko", exact: true }).click();
  await expect(page.getByText("Publikuar").first()).toBeVisible();
  const detailUrl = page.url();

  // the lecturer reads it and downloads the attachment
  await page.context().clearCookies();
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/announcements");
  await page.getByRole("link", { name: "E2E Leksion i hapur" }).click();
  await expect(page.getByText("Jeni të ftuar.")).toBeVisible();
  const href = await page.getByRole("link", { name: "e2e-orari.pdf" }).getAttribute("href");
  expect((await page.request.get(href!)).status()).toBe(200);
  await expect(page.getByRole("button", { name: "Arkivo" })).toHaveCount(0);

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} ${v.nodes[0]?.target}`),
  ).toEqual([]);

  // a student gets a 404 for it and no download
  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  const response = await page.goto(detailUrl);
  expect(response?.status()).toBe(404);
  expect((await page.request.get(href!)).status()).toBe(404);
  await page.goto("/announcements");
  await expect(page.getByRole("link", { name: "E2E Leksion i hapur" })).toHaveCount(0);
});

test("AC-10/12: a lecturer cannot write; a program coordinator cannot address everyone", async ({
  page,
}) => {
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/announcements");
  await expect(page.getByRole("link", { name: "Njoftim i ri" })).toHaveCount(0);
  await page.goto("/announcements/new");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();

  await page.context().clearCookies();
  await signInAs(page, "program-coordinator@dev.logos.test");
  await page.goto("/announcements/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Titulli").fill("E2E Për të gjithë");
  await page.getByLabel("Teksti").fill("Tekst");
  await page.getByRole("button", { name: "Ruaj si skicë" }).click();
  await expect(page.getByText("Nuk keni të drejtë t'i drejtoheni kësaj audience.")).toBeVisible();
  expect((await sql("select 1 from announcements where title like 'E2E%'")).rowCount).toBe(0);
});
