import { describe, expect, it } from "vitest";
import { announcementSchema } from "./schemas";
import { isLive, matchesViewer, type Viewer } from "./visibility";

const base = { title: "Leksion i hapur", body: "Të enjten në sallën 3.", audience: "ALL" };

describe("announcementSchema (AC-1, AC-2)", () => {
  it("accepts a minimal notice and clears unrelated audience fields", () => {
    const r = announcementSchema.parse({ ...base, cycle: "FIRST", programId: "x" });
    expect(r).toMatchObject({ cycle: null, programId: null, pinned: false, emailPush: false });
  });
  it.each([
    [{ title: " " }, "title"],
    [{ body: "" }, "body"],
    [{ title: "x".repeat(201) }, "title"],
    [{ body: "x".repeat(10_001) }, "body"],
    [{ audience: "CYCLE" }, "cycle"],
    [{ audience: "PROGRAM" }, "programId"],
    [{ publishDate: "2026-02-30" }, "publishDate"],
    [{ publishDate: "2026-10-10", expiresDate: "2026-10-09" }, "expiresDate"],
    [{ audience: "CYCLE", cycle: "FIRST", emailPush: true }, "emailPush"],
  ])("refuses %j", (patch, field) => {
    const r = announcementSchema.safeParse({ ...base, ...patch });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === field)).toBe(true);
  });
  it("allows the same day for publication and expiry", () => {
    expect(
      announcementSchema.safeParse({
        ...base,
        publishDate: "2026-10-10",
        expiresDate: "2026-10-10",
      }).success,
    ).toBe(true);
  });
});

describe("isLive (AC-3)", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const at = (s: string) => new Date(s);
  it("is live only when published and inside the window", () => {
    expect(
      isLive({ status: "PUBLISHED", publishAt: at("2026-10-23T12:00:00Z"), expiresAt: null }, now),
    ).toBe(true);
    expect(
      isLive({ status: "PUBLISHED", publishAt: at("2026-10-24T00:00:00Z"), expiresAt: null }, now),
    ).toBe(false);
    expect(
      isLive(
        {
          status: "PUBLISHED",
          publishAt: at("2026-10-01T00:00:00Z"),
          expiresAt: at("2026-10-23T12:00:00Z"),
        },
        now,
      ),
    ).toBe(false);
    expect(
      isLive(
        {
          status: "PUBLISHED",
          publishAt: at("2026-10-01T00:00:00Z"),
          expiresAt: at("2026-10-24T00:00:00Z"),
        },
        now,
      ),
    ).toBe(true);
    expect(
      isLive({ status: "DRAFT", publishAt: at("2026-10-01T00:00:00Z"), expiresAt: null }, now),
    ).toBe(false);
    expect(
      isLive({ status: "ARCHIVED", publishAt: at("2026-10-01T00:00:00Z"), expiresAt: null }, now),
    ).toBe(false);
    expect(isLive({ status: "PUBLISHED", publishAt: null, expiresAt: null }, now)).toBe(false);
  });
});

describe("matchesViewer (AC-5)", () => {
  const staff: Viewer = { staff: true, student: false, cycles: [], programIds: [] };
  const student: Viewer = { staff: false, student: true, cycles: ["FIRST"], programIds: ["p1"] };
  const bare: Viewer = { staff: false, student: true, cycles: [], programIds: [] };
  const t = (
    audience: "ALL" | "STAFF" | "STUDENTS" | "CYCLE" | "PROGRAM",
    cycle: "FIRST" | "SECOND" | null = null,
    programId: string | null = null,
  ) => ({ audience, cycle, programId });
  it("follows the audience", () => {
    expect(matchesViewer(t("ALL"), bare)).toBe(true);
    expect(matchesViewer(t("STAFF"), staff)).toBe(true);
    expect(matchesViewer(t("STAFF"), student)).toBe(false);
    expect(matchesViewer(t("STUDENTS"), student)).toBe(true);
    expect(matchesViewer(t("STUDENTS"), staff)).toBe(true);
    expect(matchesViewer(t("CYCLE", "FIRST"), student)).toBe(true);
    expect(matchesViewer(t("CYCLE", "SECOND"), student)).toBe(false);
    expect(matchesViewer(t("CYCLE", "SECOND"), bare)).toBe(false);
    expect(matchesViewer(t("PROGRAM", null, "p1"), student)).toBe(true);
    expect(matchesViewer(t("PROGRAM", null, "p2"), student)).toBe(false);
    expect(matchesViewer(t("PROGRAM", null, "p2"), staff)).toBe(true);
  });
});
