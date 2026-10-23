import { defineConfig } from "@playwright/test";

// Local runs read .env (needs `pnpm infra:up`); CI provides real environment variables.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file
}

const baseURL = process.env.APP_URL ?? "http://localhost:3100";
const port = new URL(baseURL).port || "3100";

export default defineConfig({
  testDir: "e2e",
  // One worker: tests share Keycloak dev users and the first login of a user links its account.
  workers: 1,
  use: { baseURL },
  webServer: {
    command: `pnpm dev --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
