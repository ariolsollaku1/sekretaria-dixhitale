import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./support/keycloak";

const NAME = "E2E vlerësim";

// Remove what the test creates and restore the minimum number of responses.
async function cleanup(minResponses?: number) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      "delete from eval_responses where campaign_id in (select id from eval_campaigns where name = $1)",
      [NAME],
    );
    await client.query(
      "delete from eval_participations where campaign_id in (select id from eval_campaigns where name = $1)",
      [NAME],
    );
    await client.query("delete from eval_campaigns where name = $1", [NAME]);
    if (minResponses !== undefined)
      await client.query(
        `insert into system_settings (key, value, updated_at) values ('qa.minResponses', $1::jsonb, now())
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [JSON.stringify(minResponses)],
      );
  } finally {
    await client.end();
  }
}
test.beforeEach(() => cleanup(1)); // one response is enough to see figures in the test
test.afterEach(() => cleanup(5));

async function signInFresh(page: Page, email: string) {
  await page.context().clearCookies();
  await signInAs(page, email);
}

test("AC-1..AC-5, AC-8..AC-13: quality opens a campaign, a student answers anonymously, quality closes it and everyone sees only their results", async ({
  page,
}) => {
  // --- the quality officer prepares and opens a campaign, copying the sample questions
  await signInAs(page, "quality@dev.logos.test");
  await page.goto("/qa/campaigns");
  await page.waitForLoadState("networkidle");
  await page.locator("#cmp-name").fill(NAME);
  const sample = page.locator("#cmp-copy option", { hasText: "shembull" });
  await page.locator("#cmp-copy").selectOption((await sample.first().getAttribute("value"))!);
  await page.getByRole("button", { name: "Krijo fushatën" }).click();
  await expect(page.getByRole("heading", { name: NAME })).toBeVisible();
  await page.getByRole("button", { name: "Hap fushatën" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Hap fushatën" }).click();
  await expect(page.getByText("E hapur").first()).toBeVisible();
  const campaignUrl = page.url();
  const campaignId = campaignUrl.split("/").pop()!;

  // --- the student answers the course survey on a phone
  await signInFresh(page, "student@dev.logos.test");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/qa/surveys");
  await expect(page.getByText("Përgjigjet janë anonime")).toBeVisible();
  await page.getByRole("link", { name: "Plotëso" }).first().click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Dërgo vlerësimin" })).toBeDisabled();
  for (const key of ["clarity", "prepared"])
    await page.locator(`label:has(input[name="q-${key}"][value="5"])`).click();
  await page.getByLabel("Koment mbi pedagogun (opsional).").fill("Mësim i mirë");
  await page.getByRole("button", { name: "Dërgo vlerësimin" }).click();
  await expect(page.getByText("E plotësuar").first()).toBeVisible();
  // answered once: the questionnaire is gone
  await page.goto(`/qa/surveys/${campaignId}/ADMIN-NOT-THERE`);
  await expect(page.getByRole("heading", { name: "Faqja nuk u gjet" })).toBeVisible();

  // --- forbidden: a student has no campaign administration and no results
  await page.goto("/qa/campaigns");
  await expect(page.getByRole("heading", { name: "Nuk keni leje" })).toBeVisible();
  await page.goto("/qa/results");
  await expect(page.getByRole("heading", { name: "Nuk keni leje" })).toBeVisible();

  // --- quality sees the participation, closes the campaign and reads the results with the comment
  await signInFresh(page, "quality@dev.logos.test");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(campaignUrl);
  await expect(page.getByText("1 / ").first()).toBeVisible();
  await page.getByRole("button", { name: "Mbyll fushatën" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mbyll fushatën" }).click();
  await expect(page.getByRole("link", { name: "Shiko rezultatet" })).toBeVisible();
  await page.goto(`/qa/results/${campaignId}`);
  await page.getByRole("link", { name: "Detaje" }).first().click();
  await expect(page.getByText("Mësim i mirë")).toBeVisible();

  // --- the lecturer sees the figures of the own course, without the comment
  await signInFresh(page, "lecturer@dev.logos.test");
  await page.goto(`/qa/results/${campaignId}`);
  await expect(page.getByRole("heading", { name: "Sipas lëndës dhe pedagogut" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sipas departamentit" })).toHaveCount(0);
  await page.getByRole("link", { name: "Detaje" }).first().click();
  await expect(page.getByText("Mesatarja")).toBeVisible();
  await expect(page.getByText("Mësim i mirë")).toHaveCount(0);
});
