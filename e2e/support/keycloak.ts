import { expect, type Page } from "@playwright/test";

export const DEV_PASSWORD = "Dev-Pass-12345";

/** Fills the Keycloak login form; the dev users are created by `pnpm infra:up`. */
export async function loginWithKeycloak(page: Page, email: string) {
  await page.getByRole("button", { name: /sign in|hyr/i }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
  // With a live Keycloak SSO session the form is skipped and we are already back in the app.
  const username = page.locator("#username");
  if (await username.isVisible().catch(() => false)) {
    await username.fill(email);
    await page.locator("#password").fill(DEV_PASSWORD);
    await page.locator("#kc-login").click();
  }
}

export async function signInAs(page: Page, email: string) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await loginWithKeycloak(page, email);
}

/** Opens the user menu and signs out (the control moved into the shell's user menu). */
export async function signOut(page: Page) {
  await page.getByRole("button", { name: /menyja e përdoruesit|user menu/i }).click();
  await page.getByRole("menuitem", { name: /dil|sign out/i }).click();
}
