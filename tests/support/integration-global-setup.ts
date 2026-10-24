import { execFileSync } from "node:child_process";

// AC-7: migrate the test database once per run. Fails loudly rather than touching another database.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "";
  if (!/_test(\?|$)/.test(url)) {
    throw new Error(
      "Integration tests need TEST_DATABASE_URL pointing to a database ending in _test",
    );
  }
  process.env.DATABASE_URL = url;
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
  });
}
