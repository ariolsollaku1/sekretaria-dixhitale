import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// AC-6: the fixture is excluded from `pnpm lint`; here we lint it explicitly with ignores off.
describe("module boundary lint rule", () => {
  it("rejects deep imports into another module but allows its index", async () => {
    const eslint = new ESLint({ ignore: false });
    const [result] = await eslint.lintFiles(["tests/fixtures/forbidden-import.ts"]);
    const restricted = (result?.messages ?? []).filter((m) => m.ruleId === "no-restricted-imports");
    expect(restricted.map((m) => m.line)).toEqual([2]);
  });
});
