import "server-only";
import { DomainError } from "@/lib/actions";
import { db } from "@/lib/db";
import { stateDef } from "@/lib/forms/answers";
import { getSubmission } from "@/lib/forms/queries";
import { enrollmentOf, resolveRequester } from "@/modules/stu";
import { SCHOLARSHIP_HANDLER } from "../domain/scholarship-rules";
import type { ScholarshipCategory, ScholarshipType } from "../domain/scholarship-rules";
import { finProgramScope, money, toDay } from "./fee.queries";

export type ApplicationPanel = {
  submissionId: string;
  reference: string;
  closed: boolean;
  /** What the applicant wrote, for the decision (no files). */
  answers: { academicYear: string; category: string; averageGrade: string; motivation: string };
  requester:
    | {
        studentNumber: string;
        name: string;
        enrollment: { id: string; programCode: string } | null;
        problem: string | null;
      }
    | { problem: string };
  scholarships: ScholarshipRow[];
};

export type ScholarshipRow = {
  id: string;
  yearCode: string;
  type: ScholarshipType;
  category: ScholarshipCategory;
  percent: string | null;
  amount: string | null;
  reason: string;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
};

const text = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

/** AC-3, AC-7: the decision panel of a scholarship application the user handles. */
export async function getApplicationPanel(
  user: { id: string },
  submissionId: string,
): Promise<ApplicationPanel | null> {
  const data = await getSubmission(user.id, submissionId);
  if (!data || data.form.definition.handler !== SCHOLARSHIP_HANDLER) return null;
  const { submission, form } = data;
  const answers = (submission.answers ?? {}) as Record<string, unknown>;
  let requester: ApplicationPanel["requester"];
  try {
    const r = await resolveRequester(db, user, submission);
    const student = await db.student.findUniqueOrThrow({
      where: { id: r.studentId },
      select: { studentNumber: true, person: { select: { firstName: true, lastName: true } } },
    });
    let enrollment: { id: string; programCode: string } | null = null;
    let problem: string | null = null;
    try {
      const id = enrollmentOf(r, submission.answers);
      enrollment = { id, programCode: r.open.find((e) => e.id === id)!.programCode };
      // the program must be one Finance may see (scope), else the application does not exist
      const visible = await db.enrollment.count({
        where: { id, program: await finProgramScope(user, "fin.scholarship.read") },
      });
      if (visible === 0) return null;
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      problem = error.message;
    }
    requester = {
      studentNumber: student.studentNumber,
      name: `${student.person.firstName} ${student.person.lastName}`,
      enrollment,
      problem,
    };
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    requester = { problem: error.message };
  }
  const rows = await db.scholarship.findMany({
    where: { submissionId },
    orderBy: { createdAt: "asc" },
    include: { academicYear: { select: { code: true } } },
  });
  return {
    submissionId,
    reference: submission.reference,
    closed: !!stateDef(form.definition, submission.state)?.final,
    answers: {
      academicYear: text(answers.academicYear),
      category: text(answers.category),
      averageGrade: text(answers.averageGrade),
      motivation: text(answers.motivation),
    },
    requester,
    scholarships: rows.map((s) => ({
      id: s.id,
      yearCode: s.academicYear.code,
      type: s.type,
      category: s.category,
      percent: s.percent ? money(s.percent) : null,
      amount: s.amount ? money(s.amount) : null,
      reason: s.reason,
      createdAt: toDay(s.createdAt),
      voidedAt: s.voidedAt ? toDay(s.voidedAt) : null,
      voidReason: s.voidReason,
    })),
  };
}

/** Academic years a scholarship can still be granted for (not closed), newest first. */
export async function listOpenYearOptions() {
  const years = await db.academicYear.findMany({
    where: { status: { not: "CLOSED" } },
    orderBy: { startDate: "desc" },
    select: { id: true, code: true },
  });
  return years.map((y) => ({ id: y.id, label: y.code }));
}

/** AC-6: the scholarships (live and void) of the enrollment and year of a plan the reader may see. */
export async function listPlanScholarships(
  user: { id: string },
  planId: string,
): Promise<ScholarshipRow[]> {
  const plan = await db.paymentPlan.findFirst({
    where: {
      id: planId,
      enrollment: { program: await finProgramScope(user, "fin.scholarship.read") },
    },
    select: { enrollmentId: true, academicYearId: true },
  });
  if (!plan) return [];
  const rows = await db.scholarship.findMany({
    where: { enrollmentId: plan.enrollmentId, academicYearId: plan.academicYearId },
    orderBy: { createdAt: "asc" },
    include: { academicYear: { select: { code: true } } },
  });
  return rows.map((s) => ({
    id: s.id,
    yearCode: s.academicYear.code,
    type: s.type,
    category: s.category,
    percent: s.percent ? money(s.percent) : null,
    amount: s.amount ? money(s.amount) : null,
    reason: s.reason,
    createdAt: toDay(s.createdAt),
    voidedAt: s.voidedAt ? toDay(s.voidedAt) : null,
    voidReason: s.voidReason,
  }));
}
