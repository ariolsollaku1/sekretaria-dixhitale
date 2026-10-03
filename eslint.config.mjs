import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "coverage/**",
    "docs/**",
    "scripts/**",
    "tests/fixtures/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
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
]);
