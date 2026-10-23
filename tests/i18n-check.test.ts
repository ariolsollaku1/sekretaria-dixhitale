import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function run(sq: object, en: object) {
  const dir = mkdtempSync(join(tmpdir(), "i18n-"));
  writeFileSync(join(dir, "sq.json"), JSON.stringify(sq));
  writeFileSync(join(dir, "en.json"), JSON.stringify(en));
  return spawnSync("node", ["scripts/i18n-check.mjs", dir], { encoding: "utf8" });
}

describe("i18n:check (AC-5)", () => {
  it("passes when the catalogs match", () => {
    expect(run({ a: { b: "x" } }, { a: { b: "y" } }).status).toBe(0);
  });
  it("fails when a key is missing in the default catalog (sq)", () => {
    const res = run({ a: "x" }, { a: "y", b: "z" });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('sq is missing "b"');
  });
  it("fails on an empty default-locale value", () => {
    expect(run({ a: " " }, { a: "y" }).status).toBe(1);
  });
  it("only lists keys missing in en", () => {
    const res = run({ a: "x", b: "z" }, { a: "y" });
    expect(res.status).toBe(0);
    expect(res.stderr).toContain('en is missing "b"');
  });
  it("the real catalogs are consistent", () => {
    expect(spawnSync("node", ["scripts/i18n-check.mjs"], { encoding: "utf8" }).status).toBe(0);
  });
});
