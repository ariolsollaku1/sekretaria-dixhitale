import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { getYear, type YearView } from "@/modules/org";
import { datesInsideYear, type EventInput } from "../domain/schemas";
import { shiftEvents, weekShiftDays } from "../domain/week-rules";
import { getEvent, type EventView } from "./event.queries";

type Ctx = ActionContext;
const date = (day: string) => new Date(`${day}T00:00:00Z`);

const snapshot = (e: Omit<EventView, "id" | "academicYearId" | "programName">) => ({
  title: e.title,
  type: e.type,
  startDate: e.startDate,
  endDate: e.endDate,
  description: e.description,
  audience: e.audience,
  cycle: e.cycle,
  programId: e.programId,
  active: e.active,
});

async function writableYear(ctx: Ctx, yearId: string): Promise<YearView> {
  const year = await getYear(yearId, ctx.db);
  if (!year) throw new DomainError("NOT_FOUND", "Academic year not found");
  // AC-4
  if (year.status === "CLOSED") throw new DomainError("CONFLICT", "YEAR_CLOSED");
  return year;
}

async function validate(ctx: Ctx, input: EventInput, year: YearView) {
  const errors: Record<string, string[]> = {};
  // AC-3
  if (!datesInsideYear(input, year)) errors.startDate = ["outsideYear"];
  if (input.programId) {
    const program = await ctx.db.studyProgram.findUnique({
      where: { id: input.programId },
      select: { id: true },
    });
    if (!program) errors.programId = ["programRequired"];
  }
  if (Object.keys(errors).length > 0)
    throw new DomainError("VALIDATION", "Check the event", errors);
}

/** AC-1..AC-4 */
export async function createEvent(ctx: Ctx, yearId: string, input: EventInput) {
  const year = await writableYear(ctx, yearId);
  await validate(ctx, input, year);
  const created = await ctx.db.calendarEvent.create({
    data: {
      academicYearId: yearId,
      title: input.title,
      type: input.type,
      startDate: date(input.startDate),
      endDate: date(input.endDate),
      description: input.description,
      audience: input.audience,
      cycle: input.cycle,
      programId: input.programId,
      createdById: ctx.user.id,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "cal.event.create",
    entityType: "CalendarEvent",
    entityId: created.id,
    before: null,
    after: snapshot({ ...input, active: true }),
  });
  return { eventId: created.id };
}

export async function updateEvent(ctx: Ctx, eventId: string, input: EventInput) {
  const before = await getEvent(eventId, ctx.db);
  if (!before) throw new DomainError("NOT_FOUND", "Event not found");
  const year = await writableYear(ctx, before.academicYearId);
  await validate(ctx, input, year);
  await ctx.db.calendarEvent.update({
    where: { id: eventId },
    data: {
      title: input.title,
      type: input.type,
      startDate: date(input.startDate),
      endDate: date(input.endDate),
      description: input.description,
      audience: input.audience,
      cycle: input.cycle,
      programId: input.programId,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "cal.event.update",
    entityType: "CalendarEvent",
    entityId: eventId,
    before: snapshot(before),
    after: snapshot({ ...input, active: before.active }),
  });
  return { eventId };
}

/** AC-5: cancelling keeps the row; restoring brings it back. */
export async function setEventActive(ctx: Ctx, eventId: string, active: boolean) {
  const before = await getEvent(eventId, ctx.db);
  if (!before) throw new DomainError("NOT_FOUND", "Event not found");
  await writableYear(ctx, before.academicYearId);
  if (before.active === active) return { eventId };
  await ctx.db.calendarEvent.update({
    where: { id: eventId },
    data: { active, updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: active ? "cal.event.restore" : "cal.event.cancel",
    entityType: "CalendarEvent",
    entityId: eventId,
    before: { active: before.active },
    after: { active },
  });
  return { eventId };
}

/** AC-10/AC-11: copy the source year's active events into an empty target year. */
export async function copyCalendar(ctx: Ctx, fromYearId: string, toYearId: string) {
  if (fromYearId === toYearId) throw new DomainError("VALIDATION", "SAME_YEAR");
  const from = await getYear(fromYearId, ctx.db);
  if (!from) throw new DomainError("NOT_FOUND", "Academic year not found");
  const to = await writableYear(ctx, toYearId);
  if ((await ctx.db.calendarEvent.count({ where: { academicYearId: toYearId } })) > 0)
    throw new DomainError("CONFLICT", "NOT_EMPTY");

  const source = await ctx.db.calendarEvent.findMany({
    where: { academicYearId: fromYearId, active: true },
    orderBy: { startDate: "asc" },
  });
  const days = weekShiftDays(from.startDate, to.startDate);
  const { kept, skipped } = shiftEvents(
    source.map((e) => ({
      ...e,
      startDate: e.startDate.toISOString().slice(0, 10),
      endDate: e.endDate.toISOString().slice(0, 10),
    })),
    days,
    to,
  );
  if (kept.length > 0)
    await ctx.db.calendarEvent.createMany({
      data: kept.map((e) => ({
        academicYearId: toYearId,
        title: e.title,
        type: e.type,
        startDate: date(e.startDate),
        endDate: date(e.endDate),
        description: e.description,
        audience: e.audience,
        cycle: e.cycle,
        programId: e.programId,
        createdById: ctx.user.id,
        updatedById: ctx.user.id,
      })),
    });
  await ctx.audit({
    action: "cal.calendar.copy",
    entityType: "AcademicYear",
    entityId: toYearId,
    before: null,
    after: { fromYearId, copied: kept.length, skipped, shiftDays: days },
  });
  return { copied: kept.length, skipped };
}
