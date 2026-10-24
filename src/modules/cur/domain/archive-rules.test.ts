import { describe, expect, it } from "vitest";
import { planInForce } from "./archive-rules";
import { addDocumentSchema, withdrawDocumentSchema } from "./archive-schemas";

const p = (
  id: string,
  version: number,
  validFromStart: string,
  status: "DRAFT" | "APPROVED" | "ARCHIVED" = "APPROVED",
) => ({ id, version, validFromStart, status });

describe("planInForce (AC-6)", () => {
  const plans = [
    p("a", 1, "2022-09-01", "ARCHIVED"),
    p("b", 2, "2024-09-01"),
    p("c", 3, "2026-09-01"),
    p("d", 4, "2024-09-01", "DRAFT"),
  ];
  it("takes the latest valid-from not after the year", () => {
    expect(planInForce(plans, "2024-09-01")?.id).toBe("b");
    expect(planInForce(plans, "2025-09-01")?.id).toBe("b");
    expect(planInForce(plans, "2026-09-01")?.id).toBe("c");
    expect(planInForce(plans, "2023-09-01")?.id).toBe("a");
  });
  it("ignores drafts and returns null when nothing applies", () => {
    expect(planInForce(plans, "2021-09-01")).toBeNull();
    expect(planInForce([p("x", 1, "2020-09-01", "DRAFT")], "2025-09-01")).toBeNull();
  });
  it("breaks a tie by version", () => {
    expect(planInForce([p("a", 1, "2024-09-01"), p("b", 2, "2024-09-01")], "2025-09-01")?.id).toBe(
      "b",
    );
  });
});

describe("schemas (AC-2, AC-4)", () => {
  const base = { kind: "DECISION", academicYearId: "y", fileId: "f", title: " Vendim " };
  it("trims and nulls empty optionals", () => {
    const r = addDocumentSchema.parse({ ...base, programId: "", notes: "  " });
    expect(r).toMatchObject({ title: "Vendim", programId: null, notes: null, templateId: null });
  });
  it("rejects a bad kind, empty title and malformed date", () => {
    expect(addDocumentSchema.safeParse({ ...base, kind: "X" }).success).toBe(false);
    expect(addDocumentSchema.safeParse({ ...base, title: " " }).success).toBe(false);
    expect(addDocumentSchema.safeParse({ ...base, decisionDate: "12/05/2025" }).success).toBe(
      false,
    );
  });
  it("needs a reason to withdraw", () => {
    expect(withdrawDocumentSchema.safeParse({ documentId: "d", reason: " " }).success).toBe(false);
  });
});
