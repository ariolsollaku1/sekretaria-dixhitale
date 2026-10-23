import { expect, test } from "@playwright/test";
import { signInAs } from "./support/keycloak";

const MAILPIT = `http://127.0.0.1:${process.env.MAILPIT_UI_PORT ?? "8025"}`;

test("AC-8..12: a sysadmin sends a test message; bell, list and Mailpit show it; secretary has no test button", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signInAs(page, "sysadmin@dev.logos.test");
  await page.goto("/notifications/preferences");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Më dërgo një mesazh prove" }).click();
  await expect(page.getByText("Mesazhi i provës u dërgua").first()).toBeVisible();

  // the bell shows an unread count
  await page.goto("/notifications");
  await expect(page.getByText("Njoftim provë").first()).toBeVisible();
  await expect(page.getByText("E palexuar").first()).toBeVisible();
  await page.getByRole("button", { name: "Shëno të gjitha si të lexuara" }).click();
  await expect(page.getByText("E palexuar")).toHaveCount(0);

  // the e-mail reaches Mailpit through the outbox job
  await expect
    .poll(
      async () => {
        const r = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:sysadmin@dev.logos.test subject:"Mesazh prove"')}`,
        );
        const { messages = [] } = (await r.json()) as { messages?: unknown[] };
        return messages.length > 0;
      },
      { timeout: 90_000 },
    )
    .toBe(true);

  await page.context().clearCookies();
  await signInAs(page, "secretary@dev.logos.test");
  await page.goto("/notifications/preferences");
  await expect(page.getByRole("button", { name: "Më dërgo një mesazh prove" })).toHaveCount(0);
});
