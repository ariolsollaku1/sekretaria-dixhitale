import "server-only";
import { DomainError } from "@/lib/actions";
import { db } from "@/lib/db";
import { stateDef } from "@/lib/forms/answers";
import { getSubmission } from "@/lib/forms/queries";
import { RECOGNITION_HANDLER } from "../domain/request-rules";
import { enrollmentOf, resolveRequester } from "./request-resolve";
import { scopeWhere, toDay } from "./student.queries";

export type RecognitionPanel = {
  submissionId: string;
  reference: string;
  closed: boolean;
  requester:
    | {
        studentId: string;
        name: string;
        studentNumber: string;
        enrollment: { id: string; programCode: string } | null;
        problem: string | null;
      }
    | { problem: string };
  courses: {
    id: string;
    code: string;
    name: string;
    credits: number;
    note: string | null;
    createdAt: string;
    voidedAt: string | null;
    voidReason: string | null;
  }[];
};

/** AC-8, AC-9: the decision panel of a recognition request the user handles and may see. */
export async function getRecognitionPanel(
  user: { id: string },
  submissionId: string,
): Promise<RecognitionPanel | null> {
  const data = await getSubmission(user.id, submissionId);
  if (!data || data.form.definition.handler !== RECOGNITION_HANDLER) return null;
  const { submission, form } = data;
  let requester: RecognitionPanel["requester"];
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
    } catch (error) {
      problem = error instanceof DomainError ? error.message : "UNKNOWN";
    }
    requester = {
      studentId: r.studentId,
      name: `${student.person.firstName} ${student.person.lastName}`,
      studentNumber: student.studentNumber,
      enrollment,
      problem,
    };
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    requester = { problem: error.message };
  }
  const rows = await db.recognizedCourse.findMany({
    where: { submissionId },
    orderBy: { createdAt: "asc" },
    include: { course: { select: { code: true, name: true } } },
  });
  return {
    submissionId,
    reference: submission.reference,
    closed: !!stateDef(form.definition, submission.state)?.final,
    requester,
    courses: rows.map((r) => ({
      id: r.id,
      code: r.course.code,
      name: r.course.name,
      credits: r.credits,
      note: r.note,
      createdAt: toDay(r.createdAt),
      voidedAt: r.voidedAt ? toDay(r.voidedAt) : null,
      voidReason: r.voidReason,
    })),
  };
}

/** AC-9: the live recognized courses of a student the user may see (for EXM-07). */
export async function listRecognizedCourses(user: { id: string }, studentId: string) {
  return db.recognizedCourse.findMany({
    where: { studentId, voidedAt: null, student: await scopeWhere(user) },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      enrollmentId: true,
      courseId: true,
      credits: true,
      course: { select: { code: true, name: true } },
    },
  });
}
