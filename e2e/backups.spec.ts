import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import pg from "pg";
import { signInAs } from "./support/keycloak";

// Removes the runs (and their ZIPs) this test created; audit rows are append-only by design.
async function cleanupRuns(since: Date) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ file_name: string | null }>(
      "delete from backup_runs where started_at >= $1 returning file_name",
      [since],
    );
    for (const row of rows)
      if (row.file_name)
        await rm(
          join(resolve(process.env.FILES_DIR ?? "./.data/files"), "exports", row.file_name),
          {
            force: true,
          },
        );
  } finally {
    await client.end();
  }
}

test("PLT-13: a sysadmin runs an export, downloads it and sees it logged; a secretary is refused", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const since = new Date(Date.now() - 5_000);
  try {
    await signInAs(page, "sysadmin@dev.logos.test");
    await page.getByRole("link", { name: "Kopjet rezervë" }).first().click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Kopjet rezervë dhe eksporti i të dhënave" }),
    ).toBeVisible();

    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Nis eksportin tani" }).click();
    await expect(
      page.getByText("Ekzekutimi u vu në radhë dhe do të nisë së shpejti."),
    ).toBeVisible();
    await page
      .locator("[data-sonner-toast]")
      .first()
      .waitFor({ state: "detached", timeout: 15_000 })
      .catch(() => undefined);

    // the embedded worker picks the job up within a few seconds
    const done = page
      .getByRole("row")
      .filter({ hasText: "Eksport i plotë" })
      .filter({ hasText: "I suksesshëm" });
    await expect
      .poll(
        async () => {
          await page.reload();
          return done.count();
        },
        { timeout: 90_000, intervals: [3_000] },
      )
      .toBeGreaterThan(0);

    const link = done.first().getByRole("link", { name: /Shkarko/ });
    await expect(link).toBeVisible();
    const href = (await link.getAttribute("href"))!;
    const response = await page.request.get(href);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/zip");
    expect((await response.body()).subarray(0, 2).toString()).toBe("PK");

    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      axe.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id} ${v.nodes[0]?.target}`),
    ).toEqual([]);

    // forbidden case
    await page.context().clearCookies();
    await signInAs(page, "secretary@dev.logos.test");
    await expect(page.getByRole("link", { name: "Kopjet rezervë" })).toHaveCount(0);
    await page.goto("/admin/backups");
    await expect(page.getByRole("heading", { level: 1, name: "Nuk keni leje" })).toBeVisible();
    const denied = await page.request.get(href);
    expect(denied.status()).toBe(403);
  } finally {
    await cleanupRuns(since);
  }
});
