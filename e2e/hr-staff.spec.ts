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
    "delete from staff where person_id in (select id from persons where last_name like 'E2E%')",
  );
  await sql("delete from persons where last_name like 'E2E%'");
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

test("AC-1/2/3/7/8/9/11: HR registers, edits and ends employment; finance reads without personal identifiers", async ({
  page,
}) => {
  await signInAs(page, "hr@dev.logos.test");
  await page.goto("/hr/staff/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Emri", { exact: true }).fill("Arben");
  await page.getByLabel("Mbiemri").fill("E2EHoxha");
  await page.getByLabel("Data e lindjes").fill("1980-05-12");
  await page.getByLabel("Numri personal (NID)").fill("e2e-j12345678k");
  await page.getByLabel("Email").fill("e2e.arben@logos.test");
  await page.getByLabel("Departamenti").selectOption({ index: 1 });
  await page.getByLabel("Fillimi i kontratës").fill("2020-09-01");
  await page.getByRole("button", { name: "Regjistro" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Arben E2EHoxha" })).toBeVisible();
  await expect(page.getByText("E2E-J12345678K")).toBeVisible(); // HR sees the national ID

  // a duplicate national ID is refused
  await page.goto("/hr/staff/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Emri", { exact: true }).fill("Dyfishi");
  await page.getByLabel("Mbiemri").fill("E2EDyfishi");
  await page.getByLabel("Data e lindjes").fill("1981-01-01");
  await page.getByLabel("Numri personal (NID)").fill("E2E-J12345678K");
  await page.getByLabel("Fillimi i kontratës").fill("2020-09-01");
  await page.getByRole("button", { name: "Regjistro" }).click();
  await expect(page.getByText("Ky person është tashmë në regjistrin e stafit.")).toBeVisible();

  // list shows it, filters work
  await page.goto("/hr/staff?q=E2EHoxha");
  await expect(page.getByRole("link", { name: "E2EHoxha Arben" })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} ${v.nodes[0]?.target}`),
  ).toEqual([]);

  // edit
  await page.getByRole("link", { name: "E2EHoxha Arben" }).click();
  await page.getByRole("link", { name: "Ndrysho" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Titulli", { exact: true }).fill("Prof. Dr.");
  await page.getByRole("button", { name: "Ruaj ndryshimet" }).click();
  await expect(page.getByRole("definition").filter({ hasText: "Prof. Dr." })).toBeVisible();
  const detailUrl = page.url();

  // finance reads, sees the qualification but no identifiers and no controls
  await page.context().clearCookies();
  await signInAs(page, "finance@dev.logos.test");
  await page.goto(detailUrl);
  await expect(page.getByRole("heading", { level: 1, name: "Arben E2EHoxha" })).toBeVisible();
  await expect(page.getByText("Prof. Dr.")).toBeVisible();
  await expect(page.getByText("E2E-J12345678K")).toHaveCount(0);
  await expect(page.getByText("Numri personal (NID)")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ndrysho" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mbyll punësimin" })).toHaveCount(0);

  // HR ends employment with a reason
  await page.context().clearCookies();
  await signInAs(page, "hr@dev.logos.test");
  await page.goto(detailUrl);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Mbyll punësimin" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mbyll punësimin" }).click();
  await expect(page.getByText("Shkruani arsyen.")).toBeVisible();
  await page.getByLabel("Arsyeja").fill("Kontrata përfundoi");
  await page.getByRole("dialog").getByRole("button", { name: "Mbyll punësimin" }).click();
  await expect(page.getByText("Përfunduar").first()).toBeVisible();
});

test("AC-10/13: a lecturer sees only their own record; a student is refused", async ({ page }) => {
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/hr/me");
  await expect(
    page.getByRole("heading", { level: 1, name: "Të dhënat e mia si staf" }),
  ).toBeVisible();
  await expect(page.getByText("Dr.").first()).toBeVisible();
  await page.goto("/hr/staff");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();

  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/hr/staff");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  await page.goto("/hr/me");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});

test("AC-12: HR imports staff from a file with a preview", async ({ page }) => {
  await signInAs(page, "hr@dev.logos.test");
  await page.goto("/hr/staff/import");
  await page.waitForLoadState("networkidle");
  const header = "first_name,last_name,gender,birth_date,national_id,kind,category,contract_start";
  const csv = (rows: string[]) => ({
    name: "staff.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([header, ...rows].join("\n")),
  });
  const input = page.locator('input[type="file"]');

  await input.setInputFiles(csv(["Ana,E2EBad,F,not-a-date,,academic,PAE,2020-09-01"]));
  await expect(page.getByRole("heading", { name: "Gabimet" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Importo/ })).toBeDisabled();

  await input.setInputFiles(
    csv([
      "Ana,E2EGjoni,F,12.05.1985,E2E-ID-1,academic,PAE,01.09.2020",
      "Beni,E2ELeka,M,1979-01-02,E2E-ID-2,administrative,PAK,2021-02-01",
    ]),
  );
  await expect(page.getByText("2 nga 2 rreshta janë të vlefshëm")).toBeVisible();
  await page.getByRole("button", { name: "Importo 2 anëtarë" }).click();
  await expect(page).toHaveURL(/\/hr\/staff$/);
  await page.goto("/hr/staff?q=E2E");
  await expect(page.getByRole("link", { name: "E2EGjoni Ana" })).toBeVisible();
  await expect(page.getByRole("link", { name: "E2ELeka Beni" })).toBeVisible();
});
