import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

// Published definitions are frozen by a trigger and the submissions point at them: the cleanup of
// e2e data (keys starting with "e2e-", plus the demo form's submissions) steps around it.
async function cleanup() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("alter table form_definitions disable trigger user");
    const defs = "(select id from form_definitions where key like 'e2e-%')";
    await client.query(
      `delete from form_submission_events where submission_id in (select id from form_submissions where definition_id in ${defs} or answers->>'name' like 'E2E%')`,
    );
    await client.query(
      `delete from form_submissions where definition_id in ${defs} or answers->>'name' like 'E2E%'`,
    );
    await client.query("delete from form_definitions where key like 'e2e-%'");
    await client.query("alter table form_definitions enable trigger user");
    await client.query("delete from rate_limit_hits");
    await client.query("commit");
  } finally {
    await client.end();
  }
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

const DEFINITION = JSON.stringify(
  {
    title: { sq: "Kërkesë provë", en: "Trial request" },
    fields: [
      { key: "name", type: "text", label: { sq: "Emri" }, required: true, max: 50 },
      {
        key: "kind",
        type: "select",
        label: { sq: "Lloji" },
        required: true,
        options: [
          { value: "a", label: { sq: "Lloji A" } },
          { value: "b", label: { sq: "Lloji B" } },
        ],
      },
      {
        key: "why",
        type: "text",
        label: { sq: "Pse B?" },
        required: true,
        showIf: { field: "kind", equals: "b" },
      },
    ],
    workflow: {
      initial: "new",
      states: [
        { key: "new", label: { sq: "E re" } },
        { key: "review", label: { sq: "Në shqyrtim" } },
        { key: "done", label: { sq: "Përfunduar" }, kind: "approved", final: true },
      ],
      transitions: [
        { from: "new", to: "review" },
        { from: "review", to: "done" },
      ],
    },
  },
  null,
  2,
);

test("AC-1..AC-4, 11: a sysadmin writes, validates, previews and publishes a form", async ({
  page,
}) => {
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/admin/forms/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Çelësi", { exact: true }).fill("e2e-kerkese");
  await page.getByLabel("Përcaktimi (JSON)").fill("{ not json");
  await expect(page.getByText(/JSON nuk është i vlefshëm/)).toBeVisible();
  await page.getByLabel("Përcaktimi (JSON)").fill(DEFINITION);
  await expect(page.getByText("Përcaktimi është i vlefshëm.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Parashikimi" })).toBeVisible();
  await page.getByLabel("secretary").check();
  await page.getByRole("button", { name: "Ruaj skicën" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /e2e-kerkese · v1/ })).toBeVisible();
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Publiko" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publiko" }).click();
  await expect(page.getByText("/f/e2e-kerkese")).toBeVisible();
  // a published definition is read-only
  await expect(page.getByLabel("Përcaktimi (JSON)")).toHaveAttribute("readonly", "");
});

test("AC-4..AC-9: a visitor submits without login; the Secretariat handles it; others cannot", async ({
  page,
  browser,
}) => {
  // publish through the UI as sysadmin, then act as visitor in a fresh context
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/admin/forms/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Çelësi", { exact: true }).fill("e2e-kerkese");
  await page.getByLabel("Përcaktimi (JSON)").fill(DEFINITION);
  await page.getByLabel("secretary").check();
  await page.getByRole("button", { name: "Ruaj skicën" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /e2e-kerkese · v1/ })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Publiko" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publiko" }).click();
  await expect(page.getByText("/f/e2e-kerkese")).toBeVisible();

  const visitor = await (await browser.newContext()).newPage();
  expect((await visitor.goto("/f/ska-te-tille"))?.status()).toBe(404);
  await visitor.goto("/f/e2e-kerkese");
  await expect(visitor.getByRole("heading", { level: 1, name: "Kërkesë provë" })).toBeVisible();
  await visitor.waitForLoadState("networkidle");
  // required fields are reported
  await visitor.getByRole("button", { name: "Dërgo" }).click();
  await expect(visitor.getByText("Kjo fushë është e detyrueshme.").first()).toBeVisible();
  // a conditional field appears and is then required
  await visitor.getByLabel("Emri").fill("E2E Vizitor");
  await visitor.getByLabel("Lloji").selectOption("b");
  await visitor.getByRole("button", { name: "Dërgo" }).click();
  await expect(visitor.getByLabel("Pse B?")).toBeVisible();
  await expect(visitor.getByText("Kjo fushë është e detyrueshme.")).toBeVisible();
  await visitor.getByLabel("Pse B?").fill("Sepse po");
  await visitor.getByRole("button", { name: "Dërgo" }).click();
  const reference = (await visitor.locator("p.font-tabular").first().textContent())!.trim();
  expect(reference).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/);

  // the Secretariat finds it in the inbox and moves it along
  await page.context().clearCookies();
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto(`/forms/inbox?reference=${reference}`);
  await page.getByRole("link", { name: reference }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Sepse po")).toBeVisible();
  await page.getByLabel("Koment (i brendshëm)").fill("Po e shikojmë");
  await page.getByRole("button", { name: "Kalo te: Në shqyrtim" }).click();
  await expect(page.getByText("Gjendja u ndryshua.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Kalo te: Përfunduar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kalo te: Në shqyrtim" })).toHaveCount(0);
  await expect(page.getByText("Po e shikojmë", { exact: true })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} ${v.nodes[0]?.target}`),
  ).toEqual([]);
  const detail = page.url();

  // finance is not an owner of this form: it does not exist for them
  await page.context().clearCookies();
  await signInAs(page, "finance@dev.logos.test");
  expect((await page.goto(detail))?.status()).toBe(404);
  await page.goto("/forms/inbox");
  await expect(page.getByRole("link", { name: reference })).toHaveCount(0);
  // a student has no inbox at all
  await page.context().clearCookies();
  await signInAs(page, "student@dev.logos.test");
  await page.goto("/forms/inbox");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
  await page.goto("/admin/forms");
  await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
});

test("AC-6: the sixth public submission from one address within the window is refused", async ({
  browser,
}) => {
  const visitor = await (await browser.newContext()).newPage();
  for (let i = 1; i <= 5; i++) {
    await visitor.goto("/f/kontakt-demo");
    await visitor.waitForLoadState("networkidle");
    await visitor.getByLabel("Emri dhe mbiemri").fill(`E2E Spam ${i}`);
    await visitor.getByLabel("Email").fill(`e2e${i}@t.test`);
    await visitor.getByLabel("Tema").selectOption("info");
    await visitor.getByLabel("Mesazhi").fill("Përshëndetje");
    await visitor.getByRole("button", { name: "Dërgo" }).click();
    await expect(
      visitor.getByRole("heading", { name: "Faleminderit, formulari u dërgua." }),
    ).toBeVisible();
  }
  await visitor.goto("/f/kontakt-demo");
  await visitor.waitForLoadState("networkidle");
  await visitor.getByLabel("Emri dhe mbiemri").fill("E2E Spam 6");
  await visitor.getByLabel("Email").fill("e2e6@t.test");
  await visitor.getByLabel("Tema").selectOption("info");
  await visitor.getByLabel("Mesazhi").fill("Përshëndetje");
  await visitor.getByRole("button", { name: "Dërgo" }).click();
  await expect(visitor.getByText(/Keni dërguar shumë formularë/)).toBeVisible();
});
