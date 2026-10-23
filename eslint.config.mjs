import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".claude/**",
    "node_modules/**",
    "coverage/**",
    "src/generated/**",
    "docs/**",
    "scripts/**",
    "tests/fixtures/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // AC-9 (PLT-07): application code logs through src/lib/logger.ts, which drops personal data.
      "no-console": "error",
      // conventions.md "Module boundaries": inside a module code uses relative imports, so any
      // alias/deep path into src/modules/<m>/<something> is a cross-module (or app) internal import.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*/*", "**/modules/*/*"],
              message: "Import a module only through its index.ts: '@/modules/<module>'.",
            },
          ],
        },
      ],
    },
  },
  {
    // CLI entry points and test code may print; application code uses src/lib/logger.ts.
    files: ["prisma/**", "tests/**", "e2e/**", "*.config.*"],
    rules: { "no-console": "off" },
  },
]);
