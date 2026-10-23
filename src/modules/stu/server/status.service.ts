import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { zonedDay } from "@/lib/i18n/zone";
import { endsEnrollment, validateChange, canTransfer } from "../domain/status-rules";
import type { EnrollmentStatus } from "../domain/student-rules";
import { runStatusChangeHandlers } from "./status-hooks";
import { scopeWhere, toDay } from "./student.queries";
import { addEnrollment } from "./student.service";

type Ctx = ActionContext;
const date = (day: string) => new Date(`${day}T00:00:00Z`);

/** AC-7: an enrollment of a student the user cannot see does not exist for them. */
async function loadEnrollment(ctx: Ctx, enrollmentId: string) {
  const enrollment = await ctx.db.enrollment.findFirst({
    where: { id: enrollmentId, student: await scopeWhere(ctx.user) },
    include: {
      student: { select: { id: true, personId: true } },
      history: { orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }], take: 1 },
    },
  });
  if (!enrollment) throw new DomainError("NOT_FOUND", "Enrollment not found");
  return enrollment;
}

function reasonOf(ctx: Ctx): string {
  const reason = ctx.reason?.trim();
  if (!reason)
    throw new DomainError("VALIDATION", "Reason required", { reason: ["reasonRequired"] });
  return reason;
}

function check(
  enrollment: Awaited<ReturnType<typeof loadEnrollment>>,
  to: EnrollmentStatus,
  effectiveDate: string,
) {
  const errors = validateChange({
    from: enrollment.status,
    to,
    effectiveDate,
    startedAt: toDay(enrollment.startedAt),
    lastEventDate: enrollment.history[0] ? toDay(enrollment.history[0].effectiveDate) : null,
    today: zonedDay(new Date()),
  });
  if (Object.keys(errors).length > 0)
    throw new DomainError(
      "VALIDATION",
      "Check the change",
      Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [v!]])),
    );
}

async function apply(
  ctx: Ctx,
  enrollment: Awaited<ReturnType<typeof loadEnrollment>>,
  input: { to: EnrollmentStatus; effectiveDate: string; documentRef: string | null },
  reason: string,
  auditAction: string,
) {
  const closes = endsEnrollment(input.to);
  await ctx.db.enrollment.update({
    where: { id: enrollment.id },
    data: {
      status: input.to,
      endedAt: closes ? date(input.effectiveDate) : null,
      updatedById: ctx.user.id,
    },
  });
  await ctx.db.enrollmentStatusEvent.create({
    data: {
      enrollmentId: enrollment.id,
      fromStatus: enrollment.status,
      toStatus: input.to,
      reason,
      effectiveDate: date(input.effectiveDate),
      documentRef: input.documentRef,
      createdById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: auditAction,
    entityType: "Enrollment",
    entityId: enrollment.id,
    before: {
      status: enrollment.status,
      endedAt: enrollment.endedAt ? toDay(enrollment.endedAt) : null,
    },
    after: {
      status: input.to,
      endedAt: closes ? input.effectiveDate : null,
      effectiveDate: input.effectiveDate,
      documentRef: input.documentRef,
    },
    reason,
  });
}

/** Handlers run after the change (and, for a transfer, after the new enrollment exists). */
const notifyHandlers = (
  ctx: Ctx,
  enrollment: Awaited<ReturnType<typeof loadEnrollment>>,
  to: EnrollmentStatus,
  effectiveDate: string,
  transferredTo: string | null,
) =>
  runStatusChangeHandlers(ctx, {
    enrollmentId: enrollment.id,
    studentId: enrollment.student.id,
    personId: enrollment.student.personId,
    programId: enrollment.programId,
    from: enrollment.status,
    to,
    effectiveDate,
    transferredTo,
  });

/** AC-1..AC-3, AC-5 */
export async function changeEnrollmentStatus(
  ctx: Ctx,
  input: {
    enrollmentId: string;
    to: EnrollmentStatus;
    effectiveDate: string;
    documentRef: string | null;
  },
) {
  const reason = reasonOf(ctx);
  const enrollment = await loadEnrollment(ctx, input.enrollmentId);
  check(enrollment, input.to, input.effectiveDate);
  await apply(ctx, enrollment, input, reason, "stu.enrollment.change_status");
  await notifyHandlers(ctx, enrollment, input.to, input.effectiveDate, null);
  return { enrollmentId: enrollment.id };
}

/** AC-4: close the current enrollment and open a TRANSFER enrollment elsewhere, atomically. */
export async function transferEnrollment(
  ctx: Ctx,
  input: {
    enrollmentId: string;
    programId: string;
    cohortId: string;
    effectiveDate: string;
    documentRef: string | null;
  },
) {
  const reason = reasonOf(ctx);
  const enrollment = await loadEnrollment(ctx, input.enrollmentId);
  if (!canTransfer(enrollment.status))
    throw new DomainError("VALIDATION", "Check the change", { to: ["transitionNotAllowed"] });
  check(enrollment, "DEREGISTERED", input.effectiveDate);
  // the old enrollment is closed first, so that a transfer to another cohort of the same program works
  await apply(
    ctx,
    enrollment,
    { to: "DEREGISTERED", effectiveDate: input.effectiveDate, documentRef: input.documentRef },
    reason,
    "stu.enrollment.transfer",
  );
  const created = await addEnrollment(ctx, enrollment.student.id, {
    programId: input.programId,
    cohortId: input.cohortId,
    registrationType: "TRANSFER",
    startedAt: input.effectiveDate,
  });
  await notifyHandlers(ctx, enrollment, "DEREGISTERED", input.effectiveDate, created.enrollmentId);
  return { enrollmentId: enrollment.id, newEnrollmentId: created.enrollmentId };
}
