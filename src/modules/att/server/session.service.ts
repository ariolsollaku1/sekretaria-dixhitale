import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { DomainError, type ActionContext } from "@/lib/actions";
import { ForbiddenError } from "@/lib/authz/check";
import { can } from "@/lib/authz/guard";
import { groupEntries } from "@/modules/cal";
import { getAssignmentContext, type AssignmentContext } from "@/modules/cur";
import { getOwnStaffId } from "@/modules/hr";
import { getYear } from "@/modules/org";
import {
  changedStudents,
  checkMarks,
  countMarks,
  lecturerMayRecord,
  marksOk,
  sessionsFromTimetable,
  todayInTirane,
  validateRange,
  validateSession,
} from "../domain/session-rules";
import type {
  GenerateInput,
  SaveAttendanceInput,
  SessionInput,
  UpdateSessionInput,
} from "../domain/schemas";
import { getWindowDays, rosterOf, toDay } from "./session.queries";

type Ctx = ActionContext;
/** `record`: the owner lecturer; `correct`: the Secretariat (AC-11). */
export type Mode = "record" | "correct";
const date = (d: string) => new Date(`${d}T00:00:00Z`);
const isUnique = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

function refuse(errors: Record<string, string | undefined>): never {
  throw new DomainError(
    "VALIDATION",
    "Check the session",
    Object.fromEntries(
      Object.entries(errors)
        .filter(([, v]) => v)
        .map(([k, v]) => [k, [v!]]),
    ),
  );
}

/** AC-11: `record` needs to be the assignment's lecturer, `correct` the permission on the group's scope. */
async function authorize(ctx: Ctx, mode: Mode, a: AssignmentContext) {
  if (mode === "correct") {
    if (!(await can(ctx.user, "att.attendance.correct", { kind: "group", id: a.groupId })))
      throw new ForbiddenError("att.attendance.correct");
    return;
  }
  if (!(await can(ctx.user, "att.attendance.record"))) throw new ForbiddenError("att.attendance.record");
  if ((await getOwnStaffId(ctx.user.id)) !== a.staffId)
    throw new ForbiddenError("att.attendance.record");
}

async function assignmentFor(ctx: Ctx, mode: Mode, assignmentId: string) {
  const a = await getAssignmentContext(assignmentId, ctx.db);
  if (!a) throw new DomainError("NOT_FOUND", "Assignment not found");
  await authorize(ctx, mode, a);
  if (a.yearStatus === "CLOSED") throw new DomainError("CONFLICT", "YEAR_CLOSED");
  return a;
}

async function yearBounds(ctx: Ctx, academicYearId: string) {
  const year = await getYear(academicYearId, ctx.db);
  if (!year) throw new DomainError("NOT_FOUND", "Academic year not found");
  return year;
}

const needReason = (reason: string | null | undefined) => {
  if (!reason) refuse({ reason: "required" });
};

const snapshot = (s: {
  assignmentId: string;
  date: Date | string;
  startMinute: number;
  endMinute: number;
  hours: number;
  topic: string | null;
  status?: string;
}) => ({
  assignmentId: s.assignmentId,
  date: typeof s.date === "string" ? s.date : toDay(s.date),
  startMinute: s.startMinute,
  endMinute: s.endMinute,
  hours: s.hours,
  topic: s.topic,
  status: s.status,
});

/** AC-2: sessions from the assignment's timetable entries for a date range. */
export async function generateSessions(ctx: Ctx, mode: Mode, input: GenerateInput) {
  const a = await assignmentFor(ctx, mode, input.assignmentId);
  const year = await yearBounds(ctx, a.academicYearId);
  const errors = validateRange(input.from, input.to, year);
  if (Object.keys(errors).length > 0) refuse(errors);
  const entries = (await groupEntries(a.groupId)).filter((e) => e.assignmentId === a.id);
  const planned = sessionsFromTimetable(entries, input.from, input.to);
  const existing = await ctx.db.classSession.findMany({
    where: { assignmentId: a.id, date: { gte: date(input.from), lte: date(input.to) } },
    select: { date: true, startMinute: true },
  });
  const have = new Set(existing.map((e) => `${toDay(e.date)}|${e.startMinute}`));
  const fresh = planned.filter((p) => !have.has(`${p.date}|${p.startMinute}`));
  if (fresh.length > 0)
    await ctx.db.classSession.createMany({
      data: fresh.map((p) => ({
        assignmentId: a.id,
        date: date(p.date),
        startMinute: p.startMinute,
        endMinute: p.endMinute,
        hours: p.hours,
        timetableEntryId: p.timetableEntryId,
        createdById: ctx.user.id,
        updatedById: ctx.user.id,
      })),
    });
  const result = { created: fresh.length, skipped: planned.length - fresh.length };
  await ctx.audit({
    action: "att.session.generate",
    entityType: "TeachingAssignment",
    entityId: a.id,
    before: null,
    after: { from: input.from, to: input.to, ...result },
  });
  return result;
}

/** AC-3: an extra class added by hand. */
export async function addSession(ctx: Ctx, mode: Mode, input: SessionInput) {
  const a = await assignmentFor(ctx, mode, input.assignmentId);
  const year = await yearBounds(ctx, a.academicYearId);
  const errors = validateSession(input, year);
  if (Object.values(errors).some(Boolean)) refuse(errors);
  try {
    const created = await ctx.db.classSession.create({
      data: {
        assignmentId: a.id,
        date: date(input.date),
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        hours: input.hours,
        topic: input.topic,
        createdById: ctx.user.id,
        updatedById: ctx.user.id,
      },
    });
    await ctx.audit({
      action: "att.session.create",
      entityType: "ClassSession",
      entityId: created.id,
      before: null,
      after: snapshot({ ...input, status: "PLANNED" }),
    });
    return { sessionId: created.id };
  } catch (e) {
    if (isUnique(e)) throw new DomainError("CONFLICT", "DUPLICATE");
    throw e;
  }
}

async function loadSession(ctx: Ctx, sessionId: string) {
  const s = await ctx.db.classSession.findUnique({
    where: { id: sessionId },
    include: { marks: true },
  });
  if (!s) throw new DomainError("NOT_FOUND", "Session not found");
  return s;
}

/** AC-6/AC-7: a lecturer's gate on an already dated session; the Secretariat needs a reason instead. */
async function gate(
  ctx: Ctx,
  mode: Mode,
  sessionDate: string,
  reason: string | null | undefined,
) {
  if (mode === "correct") return needReason(reason);
  const g = lecturerMayRecord(sessionDate, todayInTirane(), await getWindowDays(ctx.db));
  if (!g.ok) throw new DomainError("CONFLICT", g.reason);
}

/** AC-5..AC-7: save the roster's marks and mark the session held. */
export async function saveAttendance(ctx: Ctx, mode: Mode, input: SaveAttendanceInput) {
  const s = await loadSession(ctx, input.sessionId);
  const a = await assignmentFor(ctx, mode, s.assignmentId);
  if (s.status === "CANCELLED") throw new DomainError("CONFLICT", "CANCELLED");
  await gate(ctx, mode, toDay(s.date), input.reason);
  const roster = await rosterOf(a.groupId, a.academicYearId, ctx.db);
  const problems = checkMarks(
    roster.map((r) => r.studentId),
    input.marks,
  );
  if (!marksOk(problems)) throw new DomainError("VALIDATION", "MARKS", { marks: ["incomplete"] });

  const before = s.marks.map((m) => ({ studentId: m.studentId, status: m.status, note: m.note }));
  const after = input.marks.map((m) => ({ studentId: m.studentId, status: m.status, note: m.note }));
  for (const m of input.marks) {
    await ctx.db.attendanceMark.upsert({
      where: { sessionId_studentId: { sessionId: s.id, studentId: m.studentId } },
      create: {
        sessionId: s.id,
        studentId: m.studentId,
        status: m.status,
        note: m.note,
        markedById: ctx.user.id,
      },
      update: { status: m.status, note: m.note, markedById: ctx.user.id },
    });
  }
  await ctx.db.classSession.update({
    where: { id: s.id },
    data: {
      status: "HELD",
      heldAt: s.heldAt ?? new Date(),
      hours: input.hours,
      topic: input.topic,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "att.attendance.save",
    entityType: "ClassSession",
    entityId: s.id,
    before: { ...snapshot(s), counts: countMarks(s.marks), marks: before },
    after: {
      ...snapshot({ ...s, hours: input.hours, topic: input.topic, status: "HELD" }),
      counts: countMarks(input.marks),
      marks: after,
      changed: changedStudents(before, after),
    },
    reason: input.reason ?? undefined,
  });
  return { sessionId: s.id, counts: countMarks(input.marks) };
}

/** Change a session's date, time, hours and topic; a held one keeps its date and time. */
export async function updateSession(ctx: Ctx, mode: Mode, input: UpdateSessionInput) {
  const s = await loadSession(ctx, input.sessionId);
  const a = await assignmentFor(ctx, mode, s.assignmentId);
  if (s.status === "CANCELLED") throw new DomainError("CONFLICT", "CANCELLED");
  const year = await yearBounds(ctx, a.academicYearId);
  const errors = validateSession(input, year);
  if (Object.values(errors).some(Boolean)) refuse(errors);
  if (
    s.status === "HELD" &&
    (input.date !== toDay(s.date) ||
      input.startMinute !== s.startMinute ||
      input.endMinute !== s.endMinute)
  )
    refuse({ date: "heldFixed" });
  if (s.status === "HELD") await gate(ctx, mode, toDay(s.date), input.reason);
  try {
    await ctx.db.classSession.update({
      where: { id: s.id },
      data: {
        date: date(input.date),
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        hours: input.hours,
        topic: input.topic,
        updatedById: ctx.user.id,
      },
    });
  } catch (e) {
    if (isUnique(e)) throw new DomainError("CONFLICT", "DUPLICATE");
    throw e;
  }
  await ctx.audit({
    action: "att.session.update",
    entityType: "ClassSession",
    entityId: s.id,
    before: snapshot(s),
    after: snapshot({ ...input, assignmentId: s.assignmentId, status: s.status }),
    reason: input.reason ?? undefined,
  });
  return { sessionId: s.id };
}

/** AC-8: cancel (never delete) a session; a held one only by the Secretariat, with a reason. */
export async function cancelSession(
  ctx: Ctx,
  mode: Mode,
  input: { sessionId: string; reason?: string | null },
) {
  const s = await loadSession(ctx, input.sessionId);
  await assignmentFor(ctx, mode, s.assignmentId);
  if (s.status === "CANCELLED") throw new DomainError("CONFLICT", "CANCELLED");
  if (s.status === "HELD") {
    if (mode !== "correct") throw new DomainError("CONFLICT", "HELD_LOCKED");
    needReason(input.reason);
  }
  await ctx.db.classSession.update({
    where: { id: s.id },
    data: { status: "CANCELLED", updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: "att.session.cancel",
    entityType: "ClassSession",
    entityId: s.id,
    before: snapshot(s),
    after: snapshot({ ...s, status: "CANCELLED" }),
    reason: input.reason ?? undefined,
  });
  return { sessionId: s.id };
}
