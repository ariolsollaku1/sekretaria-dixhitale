import { expect, test } from "@playwright/test";
import { signInAs } from "./support/keycloak";

test("AC-1..AC-5: counts by two dimensions, downloads, no identifiers; a lecturer is refused", async ({
  page,
}) => {
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/stu/statistics");
  await expect(
    page.getByRole("heading", { level: 1, name: "Statistika të studentëve" }),
  ).toBeVisible();
  // the seeded demo student: program DEMO-BSC, male, active
  const row = page.getByRole("row").filter({ hasText: "DEMO-BSC" });
  await expect(row).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Meshkuj" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Gjithsej" }).last()).toBeVisible();

  await page.goto("/stu/statistics?rows=cycle&cols=cycle");
  await expect(page.getByRole("columnheader", { name: "Numri" })).toBeVisible(); // equal dimensions: one count

  await page.goto("/stu/statistics?rows=ageBand&cols=residence&program=NOPE");
  await expect(page.getByText("Nuk ka regjistrime për këto kritere.")).toBeVisible();

  const csv = await page.request.get(
    "/stu/statistics/export?rows=program&cols=gender&status=ACTIVE&format=csv",
  );
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("DEMO-BSC");
  const xlsx = await page.request.get(
    "/stu/statistics/export?rows=program&cols=gender&format=xlsx",
  );
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");

  await page.context().clearCookies();
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/stu/statistics");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  expect((await page.request.get("/stu/statistics/export?rows=program")).status()).toBe(403);
});
