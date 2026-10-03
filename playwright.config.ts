import { defineConfig } from "@playwright/test";

const baseURL = process.env.APP_URL ?? "http://localhost:3000";
const port = new URL(baseURL).port || "3000";

export default defineConfig({
  testDir: "e2e",
  use: { baseURL },
  webServer: {
    command: `pnpm dev --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
