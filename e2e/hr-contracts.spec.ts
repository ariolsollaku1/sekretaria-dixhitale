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
test.beforeEach(async () => {
  await cleanup();
  const ended = await sql(
    "insert into persons (id, first_name, last_name, gender, birth_date, created_at, updated_at) values ('e2e-p1', 'Ana', 'E2EEnded', 'FEMALE', '1980-01-01', now(), now()), ('e2e-p2', 'Beni', 'E2EFar', 'MALE', '1980-01-01', now(), now()) returning id",
  );
  void ended;
  await sql(
    "insert into staff (id, person_id, kind, category, contract_start, contract_end, active, created_at, updated_at) values ('e2e-s1', 'e2e-p1', 'ACADEMIC', 'PAK', '2020-09-01', (now() at time zone 'Europe/Tirane')::date - 5, true, now(), now()), ('e2e-s2', 'e2e-p2', 'ACADEMIC', 'PAE', '2020-09-01', (now() at time zone 'Europe/Tirane')::date + 3000, true, now(), now())",
  );
});
test.afterEach(cleanup);

test("AC-2/AC-3: HR sees the ended contract, not the far one; finance reads the same list; a lecturer is refused", async ({
  page,
}) => {
  await signInAs(page, "hr@dev.logos.test");
  await page.goto("/hr/contracts");
  await expect(page.getByRole("heading", { level: 1, name: "Mbarimi i kontratave" })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "E2EEnded" });
  await expect(row).toContainText("Ka mbaruar");
  await expect(row).toContainText("-5");
  await expect(page.getByRole("row").filter({ hasText: "E2EFar" })).toHaveCount(0);

  // widening the filter shows the far contract too
  await page.goto("/hr/contracts?state=all");
  await expect(page.getByRole("row").filter({ hasText: "E2EFar" })).toContainText("Në rregull");

  await page.context().clearCookies();
  await signInAs(page, "finance@dev.logos.test");
  await page.goto("/hr/contracts");
  await expect(page.getByRole("row").filter({ hasText: "E2EEnded" })).toBeVisible();
  await expect(page.getByText("Numri personal")).toHaveCount(0);

  await page.context().clearCookies();
  await signInAs(page, "lecturer@dev.logos.test");
  await page.goto("/hr/contracts");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
