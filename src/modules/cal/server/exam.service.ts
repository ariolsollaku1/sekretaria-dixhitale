import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { getPlanCourseContext } from "@/modules/cur";
import { getYear } from "@/modules/org";
import {
  findExamClashes,
  miniSessionAllows,
  sittingsOutside,
  validateSession,
  validateSitting,
  type ExamClash,
} from "../domain/exam-rules";
import type { SessionInput, SittingInput } from "../domain/exam-schemas";
import { getSession, listSittings, sittingsOnDay, type SittingView } from "./exam.queries";

type Ctx = ActionContext;
const date = (d: string) => new Date(`${d}T00:00:00Z`);

const fail = (errors: Record<string, string | undefined>) => {
  const bad = Object.entries(errors).filter(([, v]) => v);
  if (bad.length > 0)
    throw new DomainError(
      "VALIDATION",
      "Check the exam",
      Object.fromEntries(bad.map(([k, v]) => [k, [v!]])),
    );
};

export const describeClashes = (clashes: readonly ExamClash[]) =>
  clashes
    .map((c) => `${c.kind}:${c.other.label}${c.other.room ? ` (${c.other.room})` : ""}`)
    .join("; ");

async function openYear(ctx: Ctx, yearId: string) {
  const year = await getYear(yearId, ctx.db);
  if (!year) throw new DomainError("NOT_FOUND", "Academic year not found");
  if (year.status === "CLOSED") throw new DomainError("CONFLICT", "YEAR_CLOSED");
  return year;
}

async function loadSession(ctx: Ctx, sessionId: string) {
  const s = await getSession(sessionId, ctx.db);
  if (!s) throw new DomainError("NOT_FOUND", "Session not found");
  return s;
}

const sessionSnapshot = (s: { type: string; startDate: string; endDate: string }) => ({
  type: s.type,
  startDate: s.startDate,
  endDate: s.endDate,
});

// ---- sessions (AC-1, AC-6, AC-7) -----------------------------------------------------------------

export async function createSession(ctx: Ctx, input: SessionInput) {
  const year = await openYear(ctx, input.academicYearId);
  fail(
    validateSession({
      startDate: input.startDate,
      endDate: input.endDate,
      yearStart: year.startDate,
      yearEnd: year.endDate,
    }),
  );
  const exists = await ctx.db.examSession.count({
    where: { academicYearId: input.academicYearId, type: input.type },
  });
  if (exists > 0) throw new DomainError("CONFLICT", "SESSION_EXISTS");
  const created = await ctx.db.examSession.create({
    data: {
      academicYearId: input.academicYearId,
      type: input.type,
      startDate: date(input.startDate),
      endDate: date(input.endDate),
      createdById: ctx.user.id,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "cal.exam_session.create",
    entityType: "ExamSession",
    entityId: created.id,
    before: null,
    after: sessionSnapshot(input),
  });
  return { sessionId: created.id };
}

export async function updateSession(
  ctx: Ctx,
  sessionId: string,
  input: Pick<SessionInput, "startDate" | "endDate">,
) {
  const before = await loadSession(ctx, sessionId);
  const year = await openYear(ctx, before.academicYearId);
  fail(
    validateSession({
      startDate: input.startDate,
      endDate: input.endDate,
      yearStart: year.startDate,
      yearEnd: year.endDate,
    }),
  );
  const sittings = await listSittings({ sessionId }, ctx.db);
  if (
    sittingsOutside(
      sittings.map((s) => s.date),
      input.startDate,
      input.endDate,
    ).length > 0
  )
    throw new DomainError("VALIDATION", "Sittings outside", { endDate: ["sittingsOutside"] });
  await ctx.db.examSession.update({
    where: { id: sessionId },
    data: {
      startDate: date(input.startDate),
      endDate: date(input.endDate),
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "cal.exam_session.update",
    entityType: "ExamSession",
    entityId: sessionId,
    before: sessionSnapshot(before),
    after: sessionSnapshot({ type: before.type, ...input }),
  });
  return { sessionId };
}

/** AC-7 */
export async function setPublished(ctx: Ctx, sessionId: string, published: boolean) {
  const before = await loadSession(ctx, sessionId);
  await openYear(ctx, before.academicYearId);
  if (before.published === published) return { sessionId };
  await ctx.db.examSession.update({
    where: { id: sessionId },
    data: { publishedAt: published ? new Date() : null, updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: published ? "cal.exam_session.publish" : "cal.exam_session.unpublish",
    entityType: "ExamSession",
    entityId: sessionId,
    before: { published: before.published },
    after: { published },
  });
  return { sessionId };
}

// ---- sittings (AC-2..AC-6) -----------------------------------------------------------------------

type SittingBody = Omit<SittingInput, "sessionId" | "planCourseId">;

async function checkExaminers(ctx: Ctx, ids: readonly string[]) {
  if (ids.length === 0) return;
  const found = await ctx.db.staff.count({ where: { id: { in: [...ids] }, active: true } });
  if (found !== ids.length)
    throw new DomainError("VALIDATION", "Unknown examiner", { examinerIds: ["unknownExaminer"] });
}

async function check(
  ctx: Ctx,
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  planCourseId: string,
  body: SittingBody,
  excludeId?: string,
) {
  const pc = await getPlanCourseContext(planCourseId, ctx.db);
  if (!pc) throw new DomainError("NOT_FOUND", "Plan course not found");
  const errors: Record<string, string | undefined> = {
    ...validateSitting({
      date: body.date,
      startMinute: body.startMinute,
      endMinute: body.endMinute,
      room: body.room,
      sessionStart: session.startDate,
      sessionEnd: session.endDate,
    }),
  };
  // AC-4 (SRC-052): the mini-session takes only final-year courses
  if (session.type === "MINI" && !miniSessionAllows(pc.yearOfStudy, pc.durationYears))
    errors.planCourseId = "miniFinalYearOnly";
  fail(errors);
  await checkExaminers(ctx, body.examinerIds);
  const candidate = {
    id: excludeId,
    date: body.date,
    startMinute: body.startMinute,
    endMinute: body.endMinute,
    room: body.room,
    planId: pc.planId,
    yearOfStudy: pc.yearOfStudy,
    examinerIds: body.examinerIds,
    label: `${pc.courseCode} ${body.date}`,
  };
  const clashes = findExamClashes(
    candidate,
    await sittingsOnDay(ctx.db, session.academicYearId, body.date),
  );
  if (clashes.length > 0) throw new DomainError("CONFLICT", `CLASH:${describeClashes(clashes)}`);
  return pc;
}

const snapshot = (e: {
  planCourseId?: string;
  date: string;
  startMinute: number;
  endMinute: number;
  room: string | null;
  note: string | null;
  examinerIds: readonly string[];
}) => ({
  planCourseId: e.planCourseId,
  date: e.date,
  startMinute: e.startMinute,
  endMinute: e.endMinute,
  room: e.room,
  note: e.note,
  examinerIds: [...e.examinerIds],
});

export async function createSitting(ctx: Ctx, input: SittingInput) {
  const session = await loadSession(ctx, input.sessionId);
  await openYear(ctx, session.academicYearId);
  const taken = await ctx.db.examSitting.count({
    where: { sessionId: input.sessionId, planCourseId: input.planCourseId },
  });
  if (taken > 0) throw new DomainError("CONFLICT", "SITTING_EXISTS");
  await check(ctx, session, input.planCourseId, input);
  const created = await ctx.db.examSitting.create({
    data: {
      sessionId: input.sessionId,
      planCourseId: input.planCourseId,
      date: date(input.date),
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      room: input.room,
      note: input.note,
      createdById: ctx.user.id,
      updatedById: ctx.user.id,
      examiners: { create: input.examinerIds.map((staffId) => ({ staffId })) },
    },
  });
  await ctx.audit({
    action: "cal.exam_sitting.create",
    entityType: "ExamSitting",
    entityId: created.id,
    before: null,
    after: snapshot({ ...input }),
  });
  return { sittingId: created.id };
}

async function load(ctx: Ctx, sittingId: string): Promise<SittingView> {
  const rows = await listSittings({ id: sittingId }, ctx.db);
  if (!rows[0]) throw new DomainError("NOT_FOUND", "Exam not found");
  return rows[0];
}

export async function updateSitting(ctx: Ctx, sittingId: string, body: SittingBody) {
  const before = await load(ctx, sittingId);
  const session = await loadSession(ctx, before.sessionId);
  await openYear(ctx, session.academicYearId);
  await check(ctx, session, before.planCourseId, body, sittingId);
  await ctx.db.examSitting.update({
    where: { id: sittingId },
    data: {
      date: date(body.date),
      startMinute: body.startMinute,
      endMinute: body.endMinute,
      room: body.room,
      note: body.note,
      updatedById: ctx.user.id,
      examiners: {
        deleteMany: {},
        create: body.examinerIds.map((staffId) => ({ staffId })),
      },
    },
  });
  await ctx.audit({
    action: "cal.exam_sitting.update",
    entityType: "ExamSitting",
    entityId: sittingId,
    before: snapshot(before),
    after: snapshot({ planCourseId: before.planCourseId, ...body }),
  });
  return { sittingId };
}

export async function removeSitting(ctx: Ctx, sittingId: string) {
  const before = await load(ctx, sittingId);
  await openYear(ctx, before.academicYearId);
  await ctx.db.examSitting.delete({ where: { id: sittingId } });
  await ctx.audit({
    action: "cal.exam_sitting.remove",
    entityType: "ExamSitting",
    entityId: sittingId,
    before: snapshot(before),
    after: null,
  });
  return { sittingId };
}
