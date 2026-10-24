import { describe, expect, it } from "vitest";
import { daysUntil, windowState } from "./deadline";
import { noticeSchema, splitDocuments } from "./schemas";

const ok = {
  title: "Regjistrimi 2026",
  body: "Afati i regjistrimit.",
  academicYearId: "y1",
  registrationDeadline: "2026-09-15",
};

describe("noticeSchema (AC-1, AC-2)", () => {
  it("accepts a minimal notice and defaults the rest", () => {
    const v = noticeSchema.parse(ok);
    expect(v.documents).toEqual([]);
    expect(v.showFees).toBe(true);
    expect(v.programId).toBeNull();
  });
  it.each([
    [{ title: " " }, "title"],
    [{ body: "" }, "body"],
    [{ academicYearId: "" }, "academicYearId"],
    [{ registrationDeadline: "" }, "registrationDeadline"],
    [{ registrationDeadline: "2026-02-30" }, "registrationDeadline"],
    [{ documents: ["ok", " "] }, "documents"],
    [{ documents: ["x".repeat(201)] }, "documents"],
    [{ documents: Array.from({ length: 21 }, (_, i) => `d${i}`) }, "documents"],
    [{ contractExcerpt: "x".repeat(5001) }, "contractExcerpt"],
    [{ publishDate: "2026-09-10", expiresDate: "2026-09-01" }, "expiresDate"],
  ])("refuses %j on %s", (over, field) => {
    const r = noticeSchema.safeParse({ ...ok, ...over });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === field)).toBe(true);
  });
  it("splits a textarea into checklist lines", () => {
    expect(splitDocuments("Diploma\r\n\n  Foto  \n")).toEqual(["Diploma", "Foto"]);
  });
});

describe("deadline helpers (AC-5)", () => {
  it("counts days, negative after the deadline", () => {
    expect(daysUntil("2026-09-15", "2026-09-10")).toBe(5);
    expect(daysUntil("2026-09-15", "2026-09-15")).toBe(0);
    expect(daysUntil("2026-09-15", "2026-09-16")).toBe(-1);
  });
  it("tells where today stands in a window (inclusive)", () => {
    expect(windowState("2026-07-01", "2026-07-15", "2026-06-30")).toBe("upcoming");
    expect(windowState("2026-07-01", "2026-07-15", "2026-07-01")).toBe("running");
    expect(windowState("2026-07-01", "2026-07-15", "2026-07-15")).toBe("running");
    expect(windowState("2026-07-01", "2026-07-15", "2026-07-16")).toBe("ended");
  });
});
