import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

// FIN-02: payments are recorded on a plan the test creates for the demo student and removes again.
async function withDb<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
async function cleanup() {
  await withDb(async (c) => {
    await c.query("delete from payments");
    await c.query("delete from plan_installments");
    await c.query("delete from payment_plans");
  });
}
async function createPlan() {
  return withDb(async (c) => {
    const { rows } = await c.query(
      `select e.id as enrollment_id, s.student_number,
              (select id from academic_years where status = 'CURRENT' order by start_date desc limit 1) as year_id
         from students s join enrollments e on e.student_id = s.id
        where s.nim = 'DEMO-0001' limit 1`,
    );
    const r = rows[0];
    const plan = await c.query(
      `insert into payment_plans (id, enrollment_id, academic_year_id, updated_at)
       values (gen_random_uuid()::text, $1, $2, now()) returning id`,
      [r.enrollment_id, r.year_id],
    );
    const planId = plan.rows[0].id as string;
    for (const [seq, due, amount] of [
      [1, "2026-10-01", "600.00"],
      [2, "2099-02-01", "400.00"],
    ] as const)
      await c.query(
        `insert into plan_installments (id, plan_id, sequence, kind, label, due_date, amount, updated_at)
         values (gen_random_uuid()::text, $1, $2, 'TUITION', '', $3, $4, now())`,
        [planId, seq, due, amount],
      );
    return { planId, studentNumber: r.student_number as string };
  });
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

async function signInFresh(page: Page, email: string) {
  await page.context().clearCookies();
  await signInAs(page, email);
}

test("AC-1, 2, 5, 7, 10: Finance records, voids and imports payments", async ({ page }) => {
  const { planId, studentNumber } = await createPlan();
  await signInAs(page, "finance@dev.logos.test");
  await page.goto(`/fin/plans/${planId}`);
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByText("Nuk ka ende pagesa").or(page.getByText("Ende nuk ka pagesa")),
  ).toBeVisible();

  // --- record a payment of the first installment
  await page.getByRole("button", { name: "Regjistro një pagesë" }).click();
  await page.getByLabel("Shuma", { exact: true }).fill("600");
  await page.getByLabel("Referenca").fill("E2E-REC");
  await page.getByRole("button", { name: "Ruaj", exact: true }).click();
  await expect(page.getByText("Pagesa u regjistrua.")).toBeVisible();
  await page.waitForSelector("[data-sonner-toast]", { state: "detached" });
  await expect(page.getByRole("cell", { name: "E2E-REC" })).toBeVisible();
  await expect(page.getByText("Rregullt")).toBeVisible();

  // --- void it with a reason
  await page.getByRole("button", { name: "Anulo pagesën", exact: true }).click();
  await page.getByLabel("Arsyeja").fill("E2E wrong payer");
  await page.getByRole("button", { name: "Konfirmo anulimin" }).click();
  await expect(page.getByText("Pagesa u anulua.")).toBeVisible();
  await page.waitForSelector("[data-sonner-toast]", { state: "detached" });
  await expect(page.getByText("E2E wrong payer")).toBeVisible();
  await expect(page.getByText("Jo i rregullt")).toBeVisible();

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );

  // --- import a file: preview, then confirm
  await page.goto("/fin/payments/import");
  await page.waitForLoadState("networkidle");
  const csv = `student_number,amount,paid_on,reference,method\n${studentNumber},25.50,2025-10-05,E2E-IMP,cash\n`;
  await page.locator('input[type="file"]').setInputFiles({
    name: "payments.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.getByText(/1 nga 1 rreshta janë të vlefshëm/)).toBeVisible();
  await page.getByRole("button", { name: "Importo 1 pagesa" }).click();
  await expect(page.getByText("1 pagesa u regjistruan, 0 u anashkaluan.")).toBeVisible();
  await page.goto(`/fin/plans/${planId}`);
  await expect(page.getByRole("cell", { name: "E2E-IMP" })).toBeVisible();
  await expect(page.getByText("Importuar")).toBeVisible();
});

test("AC-11, AC-12: the student sees only their own; the Secretariat reads but cannot record; a lecturer is refused", async ({
  page,
}) => {
  const { planId } = await createPlan();
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/fin/mine");
  await expect(page.getByRole("heading", { level: 1, name: "Pagesat e mia" })).toBeVisible();
  await expect(page.getByText("600.00").first()).toBeVisible();
  await page.goto("/fin/payments/import");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();

  await signInFresh(page, "secretary@dev.logos.test");
  await page.goto(`/fin/plans/${planId}`);
  await expect(page.getByText("Pagesat", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Regjistro një pagesë" })).toHaveCount(0);
  await page.goto("/fin/payments/import");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();

  await signInFresh(page, "lecturer@dev.logos.test");
  await page.goto("/fin/mine");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  await page.goto(`/fin/plans/${planId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});
