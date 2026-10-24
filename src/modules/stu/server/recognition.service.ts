import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { DomainError, type ActionContext } from "@/lib/actions";
import { stateDef } from "@/lib/forms/answers";
import { currentRoles, mayHandle } from "@/lib/forms/access";
import { validateDefinition } from "@/lib/forms/definition";
import { RECOGNITION_HANDLER } from "../domain/request-rules";
import { enrollmentOf, resolveRequester } from "./request-resolve";

type Ctx = ActionContext;
const notFound = () => new DomainError("NOT_FOUND", "Submission not found");

/** The recognition request the user handles and may still decide on; else it does not exist. */
async function loadOpenRequest(ctx: Ctx, submissionId: string) {
  const submission = await ctx.db.formSubmission.findUnique({
    where: { id: submissionId },
    include: { definition: true },
  });
  if (!submission) throw notFound();
  if (!mayHandle(await currentRoles(ctx.user.id, ctx.db), submission.definition.ownerRoles))
    throw notFound();
  const parsed = validateDefinition(
    submission.definition.definition,
    submission.definition.audience,
  );
  if (!parsed.ok || parsed.definition.handler !== RECOGNITION_HANDLER) throw notFound();
  if (stateDef(parsed.definition, submission.state)?.final)
    throw new DomainError("CONFLICT", "REQUEST_CLOSED");
  return submission;
}

/** AC-5, AC-8 */
export async function recordRecognition(
  ctx: Ctx,
  input: { submissionId: string; courseCode: string; credits: number | null; note: string | null },
) {
  const submission = await loadOpenRequest(ctx, input.submissionId);
  const requester = await resolveRequester(ctx.db, ctx.user, submission);
  const enrollmentId = enrollmentOf(requester, submission.answers);
  const course = await ctx.db.course.findFirst({
    where: { code: { equals: input.courseCode.trim(), mode: "insensitive" }, active: true },
    select: { id: true, code: true, defaultCredits: true },
  });
  if (!course)
    throw new DomainError("VALIDATION", "Unknown course", { courseCode: ["unknownCourse"] });
  const credits = input.credits ?? course.defaultCredits;
  try {
    const created = await ctx.db.recognizedCourse.create({
      data: {
        studentId: requester.studentId,
        enrollmentId,
        submissionId: submission.id,
        courseId: course.id,
        credits,
        note: input.note,
        createdById: ctx.user.id,
      },
    });
    await ctx.audit({
      action: "stu.recognition.record",
      entityType: "RecognizedCourse",
      entityId: created.id,
      before: null,
      after: { studentId: requester.studentId, courseId: course.id, credits },
    });
    return { id: created.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new DomainError("VALIDATION", "Already recognized", {
        courseCode: ["alreadyRecognized"],
      });
    throw error;
  }
}

/** AC-6: the row stays; it only stops counting. */
export async function voidRecognition(ctx: Ctx, input: { id: string }) {
  const reason = ctx.reason?.trim();
  if (!reason)
    throw new DomainError("VALIDATION", "Reason required", { reason: ["reasonRequired"] });
  const row = await ctx.db.recognizedCourse.findUnique({ where: { id: input.id } });
  if (!row) throw new DomainError("NOT_FOUND", "Recognition not found");
  await loadOpenRequest(ctx, row.submissionId);
  if (row.voidedAt) throw new DomainError("CONFLICT", "ALREADY_VOID");
  await ctx.db.recognizedCourse.update({
    where: { id: row.id },
    data: { voidedAt: new Date(), voidedById: ctx.user.id, voidReason: reason },
  });
  await ctx.audit({
    action: "stu.recognition.void",
    entityType: "RecognizedCourse",
    entityId: row.id,
    before: { voided: false },
    after: { voided: true },
    reason,
  });
  return { id: row.id };
}
