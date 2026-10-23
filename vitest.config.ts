import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Local runs read .env (TEST_DATABASE_URL); CI provides real environment variables.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file
}

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
          exclude: ["**/*.int.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: {
          alias: [
            ...Object.entries(alias).map(([find, replacement]) => ({ find, replacement })),
            {
              find: "server-only",
              replacement: fileURLToPath(
                new URL("./tests/support/server-only-stub.ts", import.meta.url),
              ),
            },
          ],
        },
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts", "tests/**/*.int.test.ts", "prisma/**/*.int.test.ts"],
          environment: "node",
          env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "" },
          globalSetup: ["tests/support/integration-global-setup.ts"],
          setupFiles: ["tests/support/integration-setup.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
