import "server-only";
import { DomainError } from "@/lib/actions";
import type { Tx } from "@/lib/db";
import {
  identityMatches,
  pickEnrollment,
  type OpenEnrollment,
  type PickResult,
} from "../domain/request-rules";
import { scopeWhere, toDay } from "./student.queries";

type Client = Pick<Tx, "student" | "user">;

export type Requester = {
  studentId: string;
  personId: string;
  open: (OpenEnrollment & { startedAt: string })[];
};

const notIdentified = () => new DomainError("CONFLICT", "STUDENT_NOT_IDENTIFIED");

/**
 * AC-2 (Q-71): the student behind a request. A signed-in request is the submitter's own record; a
 * public one needs the student number and the date of birth to match one student. AC-9: a student
 * the user cannot see does not exist for them.
 */
export async function resolveRequester(
  db: Client,
  user: { id: string },
  submission: { answers: unknown; submitterId: string | null },
): Promise<Requester> {
  const answers = (submission.answers ?? {}) as Record<string, unknown>;
  const include = {
    person: { select: { id: true, birthDate: true } },
    enrollments: {
      where: { status: { in: ["ACTIVE", "SUSPENDED"] as ("ACTIVE" | "SUSPENDED")[] } },
      select: { id: true, startedAt: true, program: { select: { code: true } } },
    },
  };
  const visible = await scopeWhere(user);

  let student;
  if (submission.submitterId) {
    const submitter = await db.user.findUnique({
      where: { id: submission.submitterId },
      select: { personId: true },
    });
    if (!submitter?.personId) throw notIdentified();
    student = await db.student.findFirst({
      where: { AND: [{ personId: submitter.personId }, visible] },
      include,
    });
  } else {
    const number = typeof answers.studentNumber === "string" ? answers.studentNumber.trim() : "";
    if (!number) throw notIdentified();
    student = await db.student.findFirst({
      where: { AND: [{ studentNumber: number }, visible] },
      include,
    });
    if (
      student &&
      !identityMatches(answers, {
        studentNumber: student.studentNumber,
        birthDate: toDay(student.person.birthDate),
      })
    )
      student = null; // same message as "unknown": no hint about which field is wrong
  }
  if (!student) throw notIdentified();
  return {
    studentId: student.id,
    personId: student.person.id,
    open: student.enrollments.map((e) => ({
      id: e.id,
      programCode: e.program.code,
      startedAt: toDay(e.startedAt),
    })),
  };
}

/** AC-4 (Q-70): the one open enrollment the request is about, or a refusal. */
export function enrollmentOf(requester: Requester, answers: unknown): string {
  const program = (answers as Record<string, unknown> | null)?.program;
  const picked: PickResult = pickEnrollment(
    requester.open,
    typeof program === "string" ? program : null,
  );
  if (!picked.ok) throw new DomainError("CONFLICT", picked.code);
  return picked.enrollmentId;
}
