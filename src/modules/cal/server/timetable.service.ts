import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { getAssignmentContext } from "@/modules/cur";
import { getYear } from "@/modules/org";
import {
  findClashes,
  formatTime,
  validateSlot,
  type Clash,
  type Slot,
} from "../domain/timetable-rules";
import type { SlotInput } from "../domain/timetable-schemas";
import { candidatesFor, listEntries, toDay, view } from "./timetable.queries";

type Ctx = ActionContext;
const date = (d: string) => new Date(`${d}T00:00:00Z`);

export const describeClashes = (clashes: readonly Clash[]) =>
  clashes
    .map((c) => `${c.kind}:${c.other.label}${c.other.room ? ` (${c.other.room})` : ""}`)
    .join("; ");

type SlotInputLike = Omit<SlotInput, "assignmentId">;

/** The slot with defaults filled in (AC-3) and its validation errors (AC-1). */
export async function buildSlot(
  client: Ctx["db"],
  a: NonNullable<Awaited<ReturnType<typeof getAssignmentContext>>>,
  input: SlotInputLike,
) {
  const year = await getYear(a.academicYearId, client);
  const sem = year?.semesters.find((x) => x.number === a.semester);
  if (!year || !sem) throw new DomainError("NOT_FOUND", "Academic year not found");
  const slot = {
    weekday: input.weekday,
    startMinute: input.startMinute,
    endMinute: input.endMinute,
    room: input.room,
    validFrom: input.validFrom ?? sem.startDate,
    validTo: input.validTo ?? sem.endDate,
  };
  const errors: Record<string, string | undefined> = { ...validateSlot(slot) };
  if (
    !errors.validFrom &&
    !errors.validTo &&
    (slot.validFrom < year.startDate || slot.validTo > year.endDate)
  )
    errors.validFrom = "outsideYear";
  const candidate: Slot = {
    ...slot,
    groupId: a.groupId,
    staffId: a.staffId,
    label: `${a.courseCode} ${formatTime(slot.startMinute)}–${formatTime(slot.endMinute)}`,
  };
  return { slot, candidate, errors };
}

async function check(ctx: Ctx, assignmentId: string, input: SlotInputLike, excludeId?: string) {
  const a = await getAssignmentContext(assignmentId, ctx.db);
  if (!a) throw new DomainError("NOT_FOUND", "Assignment not found");
  if (a.yearStatus === "CLOSED") throw new DomainError("CONFLICT", "YEAR_CLOSED");
  const { slot, candidate, errors } = await buildSlot(ctx.db, a, input);
  const bad = Object.entries(errors).filter(([, v]) => v);
  if (bad.length > 0)
    throw new DomainError(
      "VALIDATION",
      "Check the slot",
      Object.fromEntries(bad.map(([k, v]) => [k, [v!]])),
    );
  candidate.id = excludeId;
  const clashes = findClashes(candidate, await candidatesFor(ctx.db, candidate));
  if (clashes.length > 0) throw new DomainError("CONFLICT", `CLASH:${describeClashes(clashes)}`);
  return slot;
}

const snapshot = (e: {
  assignmentId?: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  room: string | null;
  validFrom: string;
  validTo: string;
  note?: string | null;
}) => ({ ...e });

/** AC-1..AC-4 */
export async function createEntry(ctx: Ctx, input: SlotInput) {
  const slot = await check(ctx, input.assignmentId, input);
  const created = await ctx.db.timetableEntry.create({
    data: {
      assignmentId: input.assignmentId,
      weekday: slot.weekday,
      startMinute: slot.startMinute,
      endMinute: slot.endMinute,
      room: slot.room,
      validFrom: date(slot.validFrom),
      validTo: date(slot.validTo),
      note: input.note,
      createdById: ctx.user.id,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "cal.timetable.create",
    entityType: "TimetableEntry",
    entityId: created.id,
    before: null,
    after: snapshot({ assignmentId: input.assignmentId, ...slot, note: input.note }),
  });
  return { entryId: created.id };
}

async function load(ctx: Ctx, entryId: string) {
  const rows = await listEntries({ id: entryId }, ctx.db);
  if (!rows[0]) throw new DomainError("NOT_FOUND", "Entry not found");
  return rows[0];
}

export async function updateEntry(
  ctx: Ctx,
  entryId: string,
  input: Omit<SlotInput, "assignmentId">,
) {
  const before = await load(ctx, entryId);
  const slot = await check(ctx, before.assignmentId, input, entryId);
  await ctx.db.timetableEntry.update({
    where: { id: entryId },
    data: {
      weekday: slot.weekday,
      startMinute: slot.startMinute,
      endMinute: slot.endMinute,
      room: slot.room,
      validFrom: date(slot.validFrom),
      validTo: date(slot.validTo),
      note: input.note,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "cal.timetable.update",
    entityType: "TimetableEntry",
    entityId: entryId,
    before: snapshot(before),
    after: snapshot({ ...slot, note: input.note }),
  });
  return { entryId };
}

export async function removeEntry(ctx: Ctx, entryId: string) {
  const before = await load(ctx, entryId);
  const a = await getAssignmentContext(before.assignmentId, ctx.db);
  if (a?.yearStatus === "CLOSED") throw new DomainError("CONFLICT", "YEAR_CLOSED");
  await ctx.db.timetableEntry.delete({ where: { id: entryId } });
  await ctx.audit({
    action: "cal.timetable.remove",
    entityType: "TimetableEntry",
    entityId: entryId,
    before: snapshot(before),
    after: null,
  });
  return { entryId };
}

export { toDay, view };
