// Pure evaluation rules (HR-06). No I/O. Questionnaires are PLT-15 definitions (Q-25).
import type { FormDefinitionJson, FormField } from "@/lib/forms/definition";

export const EVALUATION_KINDS = ["LECTURER", "STAFF"] as const;
export type EvaluationKind = (typeof EVALUATION_KINDS)[number];

/** AC-1: the form key of each kind's questionnaire (hidden from the forms catalog). */
export const QUESTIONNAIRE_KEY: Record<EvaluationKind, string> = {
  LECTURER: "hr-evaluation-lecturer", // SRC-065
  STAFF: "hr-evaluation-staff", // SRC-141
};

/** AC-2: lecturers are academic staff, the staff campaign covers administrative staff. */
export const STAFF_KIND_OF: Record<EvaluationKind, "ACADEMIC" | "ADMINISTRATIVE"> = {
  LECTURER: "ACADEMIC",
  STAFF: "ADMINISTRATIVE",
};

const SCALE = ["1", "2", "3", "4", "5"];

/**
 * AC-5 (Q-25): a scale question is an integer number field bounded to 1..5, or a select/radio
 * whose option values are 1..5 (all of them).
 */
export function isScaleField(f: FormField): boolean {
  if (f.type === "number") return f.integer === true && f.min === 1 && f.max === 5;
  if (f.type === "select" || f.type === "radio")
    return !!f.options && f.options.length > 0 && f.options.every((o) => SCALE.includes(o.value));
  return false;
}

/** AC-5: mean of the answered scale questions, two decimals; null when none was answered. */
export function scoreAnswers(
  def: FormDefinitionJson,
  answers: Record<string, string | number | boolean>,
): number | null {
  const values: number[] = [];
  for (const f of def.fields) {
    if (!isScaleField(f)) continue;
    const raw = answers[f.key];
    if (raw === undefined) continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1 && n <= 5) values.push(n);
  }
  if (values.length === 0) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(mean * 100) / 100;
}

export const REPORT_LEVELS = ["department", "faculty", "institution"] as const;
export type ReportLevel = (typeof REPORT_LEVELS)[number];

export type ReportRow = {
  departmentCode: string | null;
  facultyCode: string | null;
  submitted: boolean;
  score: number | null;
};
export type ReportGroup = {
  key: string;
  total: number;
  submitted: number;
  scored: number;
  average: number | null;
};

/** AC-10: count, submitted and average score per group; groups sorted by key. */
export function aggregate(rows: readonly ReportRow[], level: ReportLevel): ReportGroup[] {
  const groups = new Map<
    string,
    { total: number; submitted: number; sum: number; scored: number }
  >();
  for (const r of rows) {
    const key =
      level === "institution"
        ? ""
        : ((level === "department" ? r.departmentCode : r.facultyCode) ?? "");
    const g = groups.get(key) ?? { total: 0, submitted: 0, sum: 0, scored: 0 };
    g.total += 1;
    if (r.submitted) g.submitted += 1;
    if (r.submitted && r.score !== null) {
      g.sum += r.score;
      g.scored += 1;
    }
    groups.set(key, g);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, g]) => ({
      key,
      total: g.total,
      submitted: g.submitted,
      scored: g.scored,
      average: g.scored > 0 ? Math.round((g.sum / g.scored) * 100) / 100 : null,
    }));
}
