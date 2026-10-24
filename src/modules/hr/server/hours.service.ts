import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { ForbiddenError } from "@/lib/authz/check";
import { can } from "@/lib/authz/guard";
import { sessionsForHours, todayInTirane } from "@/modules/att";
import { getAssignmentContext } from "@/modules/cur";
import { getYear } from "@/modules/org";
import {
  adjustable,
  aggregateHours,
  approvalState,
  mayApprove,
  monthBounds,
  monthInYear,
  rollupByMonth,
  type MonthTotals,
} from "../domain/hours-rules";
import type { AdjustInput, ApproveInput, ReopenInput } from "../domain/hours-schemas";

type Ctx = ActionContext;

/** AC-11: the permission, checked against the lecturer's department; the staff member must exist. */
async function authorize(
  ctx: Ctx,
  permission: "hr.hours.approve" | "hr.hours.adjust",
  staffId: string,
) {
  if (!(await can(ctx.user, permission, { kind: "staff", id: staffId })))
    throw new ForbiddenError(permission);
}

/** The month's figures for one lecturer across every academic year (sessions are dated). */
async function currentTotals(ctx: Ctx, staffId: string, month: string): Promise<MonthTotals> {
  const { from, to } = monthBounds(month);
  const [sessions, adjustments] = await Promise.all([
    sessionsForHours({ staffIds: [staffId], from, to }),
    ctx.db.hoursAdjustment.findMany({ where: { staffId, month } }),
  ]);
  const lines = aggregateHours(
    sessions.map((s) => ({
      assignmentId: s.assignmentId,
      staffId,
      date: s.date,
      hours: s.hours,
      status: s.status,
    })),
    adjustments,
    todayInTirane(),
  );
  return (
    rollupByMonth(lines)[0] ?? {
      staffId,
      month,
      sessions: 0,
      heldHours: 0,
      adjustmentHours: 0,
      total: 0,
      pending: 0,
    }
  );
}

const figures = (t: { heldHours: number; adjustmentHours: number }) => ({
  heldHours: t.heldHours,
  adjustmentHours: t.adjustmentHours,
});

/** AC-6: approve an ended month, storing the figures seen. */
export async function approveMonth(ctx: Ctx, input: ApproveInput) {
  await authorize(ctx, "hr.hours.approve", input.staffId);
  const totals = await currentTotals(ctx, input.staffId, input.month);
  const may = mayApprove(input.month, todayInTirane(), totals);
  if (!may.ok) throw new DomainError("CONFLICT", may.reason);
  const key = { staffId_month: { staffId: input.staffId, month: input.month } };
  const before = await ctx.db.hoursApproval.findUnique({ where: key });
  if (approvalState(before, totals) === "APPROVED")
    throw new DomainError("CONFLICT", "ALREADY_APPROVED");
  const data = {
    status: "APPROVED" as const,
    ...figures(totals),
    decidedAt: new Date(),
    decidedById: ctx.user.id,
  };
  const row = await ctx.db.hoursApproval.upsert({
    where: key,
    create: { staffId: input.staffId, month: input.month, ...data },
    update: data,
  });
  await ctx.audit({
    action: "hr.hours.approve",
    entityType: "HoursApproval",
    entityId: row.id,
    before: before ? { status: before.status, ...figures(before) } : null,
    after: { staffId: input.staffId, month: input.month, status: "APPROVED", ...figures(totals) },
  });
  return { approvalId: row.id };
}

/** AC-8: reopen an approved month with a reason; the row is kept. */
export async function reopenMonth(ctx: Ctx, input: ReopenInput) {
  await authorize(ctx, "hr.hours.approve", input.staffId);
  const key = { staffId_month: { staffId: input.staffId, month: input.month } };
  const before = await ctx.db.hoursApproval.findUnique({ where: key });
  if (!before || before.status !== "APPROVED") throw new DomainError("CONFLICT", "NOT_APPROVED");
  await ctx.db.hoursApproval.update({
    where: key,
    data: { status: "OPEN", decidedAt: new Date(), decidedById: ctx.user.id },
  });
  await ctx.audit({
    action: "hr.hours.reopen",
    entityType: "HoursApproval",
    entityId: before.id,
    before: { status: before.status, ...figures(before) },
    after: { staffId: input.staffId, month: input.month, status: "OPEN", reason: input.reason },
  });
  return { approvalId: before.id };
}

/** AC-9/AC-10: an append-only adjustment of one of the lecturer's assignments for a month. */
export async function addAdjustment(ctx: Ctx, input: AdjustInput) {
  await authorize(ctx, "hr.hours.adjust", input.staffId);
  const a = await getAssignmentContext(input.assignmentId, ctx.db);
  if (!a || a.staffId !== input.staffId) throw new DomainError("NOT_FOUND", "Assignment not found");
  if (a.yearStatus === "CLOSED") throw new DomainError("CONFLICT", "YEAR_CLOSED");
  const year = await getYear(a.academicYearId, ctx.db);
  if (!year || !monthInYear(input.month, year.startDate, year.endDate))
    throw new DomainError("VALIDATION", "MONTH_OUTSIDE_YEAR", { month: ["monthOutsideYear"] });
  const totals = await currentTotals(ctx, input.staffId, input.month);
  const approval = await ctx.db.hoursApproval.findUnique({
    where: { staffId_month: { staffId: input.staffId, month: input.month } },
  });
  if (!adjustable(approvalState(approval, totals))) throw new DomainError("CONFLICT", "APPROVED");
  const row = await ctx.db.hoursAdjustment.create({
    data: {
      staffId: input.staffId,
      assignmentId: input.assignmentId,
      month: input.month,
      hours: input.hours,
      reason: input.reason,
      createdById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "hr.hours.adjust",
    entityType: "HoursAdjustment",
    entityId: row.id,
    before: null,
    after: {
      staffId: input.staffId,
      assignmentId: input.assignmentId,
      month: input.month,
      hours: input.hours,
      reason: input.reason,
    },
  });
  return { adjustmentId: row.id };
}
