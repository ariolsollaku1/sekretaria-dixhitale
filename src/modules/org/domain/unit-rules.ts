// Pure rules for faculties and departments (ORG-02). No I/O.

export const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,11}$/;

/** AC-2: trim and upper-case; the stored form is the comparison form. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export type CodeCheck = { ok: true; code: string } | { ok: false; reason: "invalidCode" };

/** 2–12 characters from A–Z 0–9 - _, not starting with a separator. */
export function validateCode(raw: string): CodeCheck {
  const code = normalizeCode(raw);
  return CODE_PATTERN.test(code) ? { ok: true, code } : { ok: false, reason: "invalidCode" };
}

export type RuleResult =
  | { ok: true }
  | { ok: false; reason: "HAS_ACTIVE_DEPARTMENTS" | "FACULTY_INACTIVE"; count?: number };

/** AC-6: a faculty with active departments cannot be deactivated. */
export function canDeactivateFaculty(activeDepartments: number): RuleResult {
  return activeDepartments > 0
    ? { ok: false, reason: "HAS_ACTIVE_DEPARTMENTS", count: activeDepartments }
    : { ok: true };
}

/** AC-4/AC-6: departments live under an active faculty (creation and reactivation). */
export function canPlaceDepartment(facultyActive: boolean): RuleResult {
  return facultyActive ? { ok: true } : { ok: false, reason: "FACULTY_INACTIVE" };
}

export const cleanName = (raw: string) => raw.trim().replace(/\s+/g, " ");
