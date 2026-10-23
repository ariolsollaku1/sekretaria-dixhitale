import { describe, expect, it } from "vitest";
import {
  addEnrollmentSchema,
  personalSchema,
  registerStudentSchema,
  yearRegistrationSchema,
} from "./schemas";
import {
  isOpenStatus,
  isStudentNumber,
  normalizeNim,
  validNim,
  validateYearRegistration,
} from "./student-rules";

const person = {
  firstName: "Ana",
  lastName: "Leka",
  gender: "FEMALE",
  birthDate: "2003-04-05",
};

describe("NIM and numbers (AC-1)", () => {
  it("normalizes the NIM and treats blank as none", () => {
    expect(normalizeNim(" ab-123 ")).toBe("AB-123");
    expect(normalizeNim("")).toBeNull();
    expect(normalizeNim("   ")).toBeNull();
    expect(normalizeNim(null)).toBeNull();
    expect(validNim("A".repeat(30))).toBe(true);
    expect(validNim("A".repeat(31))).toBe(false);
    expect(validNim("A\nB")).toBe(false);
  });
  it("recognizes generated student numbers", () => {
    expect(isStudentNumber("000001")).toBe(true);
    expect(isStudentNumber("1234567")).toBe(true);
    expect(isStudentNumber("12345")).toBe(false);
    expect(isStudentNumber("00000A")).toBe(false);
  });
  it("counts ACTIVE and SUSPENDED as open", () => {
    expect(["ACTIVE", "SUSPENDED"].every((s) => isOpenStatus(s as never))).toBe(true);
    expect(["DEREGISTERED", "GRADUATED"].some((s) => isOpenStatus(s as never))).toBe(false);
  });
});

describe("personal and registration schemas (AC-4, AC-6)", () => {
  it("accepts minimal personal data and normalizes optional fields", () => {
    const r = personalSchema.parse({
      ...person,
      nim: " x1 ",
      email: " A@B.TEST ",
      nationalId: " k1 ",
    });
    expect(r).toMatchObject({
      nim: "X1",
      email: "a@b.test",
      nationalId: "K1",
      fatherName: null,
      residence: null,
    });
  });
  it.each([
    [{ firstName: " " }, "firstName"],
    [{ gender: "X" }, "gender"],
    [{ birthDate: "2999-01-01" }, "birthDate"],
    [{ birthDate: "2003-02-30" }, "birthDate"],
    [{ email: "nope" }, "email"],
    [{ nim: "A".repeat(31) }, "nim"],
    [{ residence: "x".repeat(101) }, "residence"],
  ])("refuses %j", (patch, field) => {
    const r = personalSchema.safeParse({ ...person, ...patch });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === field)).toBe(true);
  });
  it("takes an optional first enrollment", () => {
    expect(registerStudentSchema.parse(person).enrollment).toBeNull();
    const withE = registerStudentSchema.parse({
      ...person,
      enrollment: {
        programId: "p",
        cohortId: "c",
        registrationType: "FIRST_TIME",
        startedAt: "2026-09-15",
      },
    });
    expect(withE.enrollment).toMatchObject({ programId: "p" });
    expect(
      addEnrollmentSchema.safeParse({
        studentId: "s",
        programId: "p",
        cohortId: "c",
        registrationType: "OTHER",
        startedAt: "2026-09-15",
      }).success,
    ).toBe(false);
    expect(
      addEnrollmentSchema.safeParse({
        studentId: "s",
        programId: "p",
        cohortId: "",
        registrationType: "TRANSFER",
        startedAt: "2026-09-15",
      }).success,
    ).toBe(false);
  });
  it("validates year registration input", () => {
    const base = { enrollmentId: "e", academicYearId: "y", yearOfStudy: 1, groupId: "g" };
    expect(yearRegistrationSchema.safeParse(base).success).toBe(true);
    expect(yearRegistrationSchema.safeParse({ ...base, yearOfStudy: 0 }).success).toBe(false);
    expect(yearRegistrationSchema.safeParse({ ...base, groupId: "" }).success).toBe(false);
  });
});

describe("validateYearRegistration (AC-7)", () => {
  const ok = {
    yearOfStudy: 2,
    durationYears: 3,
    enrollmentStatus: "ACTIVE" as const,
    yearStatus: "CURRENT" as const,
    group: { cohortId: "c1", academicYearId: "y1", yearOfStudy: 2, active: true },
    enrollment: { cohortId: "c1" },
    academicYearId: "y1",
  };
  it("accepts a consistent registration", () => {
    expect(validateYearRegistration(ok)).toEqual({});
  });
  it.each([
    [{ yearOfStudy: 4 }, "yearOfStudy"],
    [{ enrollmentStatus: "SUSPENDED" as const }, "enrollmentId"],
    [{ yearStatus: "CLOSED" as const }, "academicYearId"],
    [{ group: null }, "groupId"],
    [{ group: { cohortId: "c2", academicYearId: "y1", yearOfStudy: 2, active: true } }, "groupId"],
    [{ group: { cohortId: "c1", academicYearId: "y2", yearOfStudy: 2, active: true } }, "groupId"],
    [{ group: { cohortId: "c1", academicYearId: "y1", yearOfStudy: 1, active: true } }, "groupId"],
    [{ group: { cohortId: "c1", academicYearId: "y1", yearOfStudy: 2, active: false } }, "groupId"],
  ])("refuses %j", (patch, field) => {
    expect(Object.keys(validateYearRegistration({ ...ok, ...patch }))).toContain(field);
  });
});
