import { describe, expect, it } from "vitest";
import { BULK_MAX, enrollBlocker, isEnrollable, personDraft, typeAllowed } from "./enroll-rules";

const types = [
  { key: "diploma", required: true },
  { key: "photo", required: false },
];

describe("enrollBlocker", () => {
  const base = { documentTypes: types, uploadedKeys: ["diploma"], allowMissingDocuments: false };
  it("lets enrollable statuses through", () => {
    for (const status of ["SUBMITTED", "IN_REVIEW", "ACCEPTED"])
      expect(enrollBlocker({ ...base, status })).toBeNull();
  });
  it("refuses rejected and enrolled applications", () => {
    expect(enrollBlocker({ ...base, status: "REJECTED" })).toBe("notEnrollable");
    expect(enrollBlocker({ ...base, status: "ENROLLED" })).toBe("alreadyEnrolled");
  });
  it("refuses a missing required document unless allowed", () => {
    const missing = { ...base, status: "ACCEPTED", uploadedKeys: [] };
    expect(enrollBlocker(missing)).toBe("documentsMissing");
    expect(enrollBlocker({ ...missing, allowMissingDocuments: true })).toBeNull();
  });
  it("ignores a missing optional document", () => {
    expect(enrollBlocker({ ...base, status: "SUBMITTED" })).toBeNull();
  });
});

describe("small rules", () => {
  it("isEnrollable", () => {
    expect(isEnrollable("ACCEPTED")).toBe(true);
    expect(isEnrollable("REJECTED")).toBe(false);
  });
  it("typeAllowed: a known student is never first time", () => {
    expect(typeAllowed("FIRST_TIME", true)).toBe(false);
    expect(typeAllowed("SECOND_PROGRAM", true)).toBe(true);
    expect(typeAllowed("FIRST_TIME", false)).toBe(true);
  });
  it("bulk limit", () => expect(BULK_MAX).toBe(100));
  it("personDraft maps the application and leaves the NIM empty", () => {
    const d = personDraft({
      firstName: "A",
      lastName: "B",
      fatherName: null,
      gender: "FEMALE",
      birthDate: "2007-01-01",
      birthPlace: null,
      nationalId: null,
      email: "a@b.test",
      phone: "1",
      address: "x",
      residence: null,
    });
    expect(d.nim).toBeNull();
    expect(d.email).toBe("a@b.test");
  });
});
