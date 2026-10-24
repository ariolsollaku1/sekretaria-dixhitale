import { describe, expect, it } from "vitest";
import { csvField, csvRow } from "./csv";
import { buildManifest, zipFilePath } from "./manifest";
import { isStale, selectPurge } from "./retention";
import { exportableTables } from "./tables";

describe("csv (AC-1)", () => {
  it("quotes only where needed and writes null as empty", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField(null)).toBe("");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line\nbreak")).toBe('"line\nbreak"');
    expect(csvField("=SUM(A1)")).toBe("=SUM(A1)"); // data is not altered
    expect(csvRow(["a", null, "b,c"])).toBe('a,,"b,c"\r\n');
  });
});

describe("table filter (AC-3)", () => {
  it("drops secrets, tokens, the run log and the migration table; sorts", () => {
    const all = [
      "students",
      "sessions",
      "accounts",
      "verifications",
      "calendar_feed_tokens",
      "rate_limit_hits",
      "backup_runs",
      "_prisma_migrations",
      "audit_logs",
    ];
    expect(exportableTables(all)).toEqual(["audit_logs", "students"]);
  });
});

describe("manifest (AC-4)", () => {
  it("is versioned and carries the entries", () => {
    const m = buildManifest({
      generatedAt: new Date("2026-10-24T00:30:00Z"),
      appVersion: "0.1.0",
      tables: [{ table: "t", rows: 1, csvSha256: "a", jsonlSha256: "b" }],
      files: [],
    });
    expect(m).toMatchObject({ format: "logos-export/1", generatedAt: "2026-10-24T00:30:00.000Z" });
  });
  it("builds safe, unique zip paths", () => {
    expect(zipFilePath("abc", "../../etc/pass wd.pdf").slice(6)).not.toContain("/");
    expect(zipFilePath("abc", ".hidden")).toBe("files/abc-_hidden");
    expect(zipFilePath("abc", "çertifikatë.pdf")).not.toContain("ç");
  });
});

describe("retention (AC-6, AC-8)", () => {
  const run = (id: string, day: number) => ({ id, startedAt: new Date(Date.UTC(2026, 9, day)) });
  it("purges all but the newest N", () => {
    const runs = [run("a", 1), run("c", 3), run("b", 2), run("d", 4)];
    expect(selectPurge(runs, 2).map((r) => r.id)).toEqual(["b", "a"]);
    expect(selectPurge(runs, 10)).toEqual([]);
  });
  it("flags a missing or old success as stale", () => {
    const now = new Date("2026-10-24T12:00:00Z");
    expect(isStale(null, 36, now)).toBe(true);
    expect(isStale(new Date("2026-10-23T12:00:00Z"), 36, now)).toBe(false);
    expect(isStale(new Date("2026-10-22T12:00:00Z"), 36, now)).toBe(true);
  });
});
