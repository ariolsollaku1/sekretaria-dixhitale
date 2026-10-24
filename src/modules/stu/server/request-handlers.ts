import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { can } from "@/lib/authz/guard";
import { registerFormHandler } from "@/lib/forms/handlers";
import { zonedDay } from "@/lib/i18n/zone";
import {
  clampEffectiveDate,
  DEREGISTRATION_HANDLER,
  RECOGNITION_HANDLER,
} from "../domain/request-rules";
import { enrollmentOf, resolveRequester } from "./request-resolve";
import { changeEnrollmentStatus } from "./status.service";
import { toDay } from "./student.queries";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * SRC-037b, AC-3/AC-4: approving a deregistration request closes the student's enrollment through
 * the STU-02 service, in the transaction of the approval; any refusal rolls the approval back.
 */
registerFormHandler(DEREGISTRATION_HANDLER, {
  async onApproved(ctx: ActionContext, submission) {
    if (!(await can(ctx.user, "stu.student.write")))
      throw new DomainError("CONFLICT", "NOT_ALLOWED_TO_DEREGISTER");
    const row = await ctx.db.formSubmission.findUniqueOrThrow({
      where: { id: submission.submissionId },
      select: { reference: true, answers: true, submitterId: true },
    });
    const requester = await resolveRequester(ctx.db, ctx.user, row);
    const enrollmentId = enrollmentOf(requester, row.answers);
    const enrollment = requester.open.find((e) => e.id === enrollmentId)!;
    const last = await ctx.db.enrollmentStatusEvent.findFirst({
      where: { enrollmentId },
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      select: { effectiveDate: true },
    });
    const floor = last ? toDay(last.effectiveDate) : enrollment.startedAt;
    const answers = row.answers as Record<string, unknown>;
    const effectiveDate = clampEffectiveDate(
      typeof answers.requestedDate === "string" ? answers.requestedDate : null,
      floor,
      zonedDay(new Date()),
    );
    const reason = text(answers.reason, 1000) || "Student request";
    await changeEnrollmentStatus(
      { ...ctx, reason },
      {
        enrollmentId,
        to: "DEREGISTERED",
        effectiveDate,
        documentRef: `FORM:${row.reference}`,
      },
    );
  },
});

/**
 * SRC-037c, AC-7: a recognition request is approved only when at least one recognized course was
 * recorded for it; the recorded courses are the stored decision (read by EXM-07).
 */
registerFormHandler(RECOGNITION_HANDLER, {
  async onApproved(ctx: ActionContext, submission) {
    const live = await ctx.db.recognizedCourse.count({
      where: { submissionId: submission.submissionId, voidedAt: null },
    });
    if (live === 0) throw new DomainError("CONFLICT", "NO_RECOGNIZED_COURSES");
  },
  detailHref: (submissionId: string) => `/stu/requests/${submissionId}`,
});
