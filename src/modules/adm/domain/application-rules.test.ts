import { describe, expect, it } from "vitest";
import {
  birthDateOk,
  emailKey,
  gradeOk,
  isCycleOpen,
  isTokenExpired,
  makeReference,
  mayUpload,
  missingRequired,
  todayInTirane,
  tokenExpiry,
  TOKEN_PATTERN,
} from "./application-rules";
import { applicationSchema, cycleSchema } from "./schemas";

describe("references and tokens", () => {
  it("makes AP- references from the readable alphabet", () => {
    const ref = makeReference(new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253]));
    expect(ref).toMatch(/^AP-[2-9A-HJKMNP-Z]{8}$/);
  });
  it("tokens are 43 url-safe characters", () => {
    expect(TOKEN_PATTERN.test("a".repeat(43))).toBe(true);
    expect(TOKEN_PATTERN.test("a".repeat(42))).toBe(false);
    expect(TOKEN_PATTERN.test(`${"a".repeat(42)}!`)).toBe(false);
  });
  it("a link lives 180 days", () => {
    const from = new Date("2026-10-24T10:00:00Z");
    const end = tokenExpiry(from);
    expect(end.toISOString()).toBe("2027-04-22T10:00:00.000Z");
    expect(isTokenExpired(end, new Date(end.getTime() - 1))).toBe(false);
    expect(isTokenExpired(end, end)).toBe(true);
  });
});

describe("cycle window (Europe/Tirane)", () => {
  const cycle = { active: true, opensOn: "2026-06-01", closesOn: "2026-09-15" };
  it("is open on both boundary days and closed outside", () => {
    expect(isCycleOpen(cycle, "2026-06-01")).toBe(true);
    expect(isCycleOpen(cycle, "2026-09-15")).toBe(true);
    expect(isCycleOpen(cycle, "2026-05-31")).toBe(false);
    expect(isCycleOpen(cycle, "2026-09-16")).toBe(false);
  });
  it("is closed when inactive", () => {
    expect(isCycleOpen({ ...cycle, active: false }, "2026-07-01")).toBe(false);
  });
  it("takes the date in Tirane, not UTC", () => {
    expect(todayInTirane(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02");
  });
});

describe("documents and uploads", () => {
  const types = [
    { key: "id", required: true },
    { key: "photo", required: false },
    { key: "diploma", required: true },
  ];
  it("lists required types without a file", () => {
    expect(missingRequired(types, ["id"])).toEqual(["diploma"]);
    expect(missingRequired(types, new Set(["id", "diploma"]))).toEqual([]);
    expect(missingRequired(types, [])).toEqual(["id", "diploma"]);
  });
  it("uploads are allowed only before the decision", () => {
    expect(mayUpload("SUBMITTED")).toBe(true);
    expect(mayUpload("IN_REVIEW")).toBe(true);
    expect(mayUpload("ACCEPTED")).toBe(false);
    expect(mayUpload("REJECTED")).toBe(false);
  });
});

describe("value rules", () => {
  it("birth dates", () => {
    expect(birthDateOk("2000-02-29", "2026-10-24")).toBe(true);
    expect(birthDateOk("2001-02-29", "2026-10-24")).toBe(false);
    expect(birthDateOk("2027-01-01", "2026-10-24")).toBe(false);
    expect(birthDateOk("1899-12-31", "2026-10-24")).toBe(false);
    expect(birthDateOk("nonsense", "2026-10-24")).toBe(false);
  });
  it("grades 5 to 10", () => {
    expect([4.99, 5, 7.5, 10, 10.01].map(gradeOk)).toEqual([false, true, true, true, false]);
  });
  it("duplicate key ignores case and spaces", () => {
    expect(emailKey("  Ana@Example.COM ")).toBe("ana@example.com");
  });
});

const valid = {
  cycleId: "c1",
  programId: "p1",
  locale: "sq",
  firstName: "Ana",
  lastName: "Hoxha",
  gender: "FEMALE",
  birthDate: "2007-03-14",
  email: "ana@example.com",
  phone: "+355 69 000 0000",
  address: "Rr. Kavajes 1, Tirane",
  schoolName: "Gjimnazi Sami Frasheri",
  graduationYear: "2025",
  averageGrade: "9,25",
  consent: true,
};

describe("application schema (AC-3, AC-4)", () => {
  it("accepts a complete application and normalizes", () => {
    const r = applicationSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.averageGrade).toBe(9.25);
      expect(r.data.graduationYear).toBe(2025);
      expect(r.data.fatherName).toBeNull();
    }
  });
  const codes = (input: unknown) => {
    const r = applicationSchema.safeParse(input);
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}:${i.message}`);
  };
  it("refuses missing required fields, bad e-mail, grade, year and consent", () => {
    expect(codes({ ...valid, firstName: " " })).toContain("firstName:required");
    expect(codes({ ...valid, email: "nope" })).toContain("email:invalidEmail");
    expect(codes({ ...valid, averageGrade: "11" })).toContain("averageGrade:invalidGrade");
    expect(codes({ ...valid, averageGrade: "abc" })).toContain("averageGrade:invalidGrade");
    expect(codes({ ...valid, graduationYear: "1800" })).toContain("graduationYear:invalidYear");
    expect(codes({ ...valid, consent: false })).toContain("consent:consentRequired");
    expect(codes({ ...valid, birthDate: "2999-01-01" })).toContain("birthDate:invalidBirthDate");
    expect(codes({ ...valid, gender: undefined })).toContain("gender:required");
  });
});

describe("cycle schema (AC-1)", () => {
  const base = {
    academicYearId: "y1",
    name: "Round 1",
    opensOn: "2026-06-01",
    closesOn: "2026-09-15",
    active: true,
    documents: [{ key: "id-card", labelSq: "Letërnjoftimi", required: true }],
  };
  it("accepts a valid cycle", () => {
    expect(cycleSchema.safeParse(base).success).toBe(true);
  });
  it("refuses a reversed window and duplicate or malformed keys", () => {
    const r = cycleSchema.safeParse({
      ...base,
      closesOn: "2026-05-01",
      documents: [
        { key: "a1", labelSq: "A", required: true },
        { key: "a1", labelSq: "B", required: false },
        { key: "Bad Key", labelSq: "C", required: false },
      ],
    });
    expect(r.success).toBe(false);
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(msgs).toContain("windowOrder");
    expect(msgs).toContain("duplicateKey");
    expect(msgs).toContain("invalidKey");
  });
});
