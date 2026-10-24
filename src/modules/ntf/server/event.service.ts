import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { ForbiddenError } from "@/lib/authz/check";
import { instantToZonedDateTime, zonedDateTimeToInstant } from "@/lib/i18n/zone";
import { notify } from "@/lib/notify/notify";
import { mayUnregister, registrationState } from "../domain/event-rules";
import type { EventInput } from "../domain/event-schemas";
import { getEvent, registrableEvent, type EventView } from "./event.queries";
import { mayTarget } from "./announcement.queries";

type Ctx = ActionContext;

/** Wall-clock time in Europe/Tirane for notification texts, e.g. `2026-12-10 18:30`. */
export const whenText = (d: Date) => instantToZonedDateTime(d).replace("T", " ");

const snapshot = (
  e: Pick<
    EventView,
    | "title"
    | "location"
    | "startsAt"
    | "endsAt"
    | "capacity"
    | "registrationDeadline"
    | "status"
    | "audience"
    | "cycle"
    | "programId"
    | "announcementId"
  >,
) => ({
  title: e.title,
  location: e.location,
  startsAt: e.startsAt,
  endsAt: e.endsAt,
  capacity: e.capacity,
  registrationDeadline: e.registrationDeadline,
  status: e.status,
  audience: e.audience,
  cycle: e.cycle,
  programId: e.programId,
  announcementId: e.announcementId,
});

async function checkTarget(
  ctx: Ctx,
  t: Pick<EventView, "audience" | "programId"> & { announcementId?: string | null },
) {
  if (t.programId) {
    const program = await ctx.db.studyProgram.findUnique({
      where: { id: t.programId },
      select: { id: true },
    });
    if (!program)
      throw new DomainError("VALIDATION", "Check the event", { programId: ["programRequired"] });
  }
  if (t.announcementId) {
    const announcement = await ctx.db.announcement.findUnique({
      where: { id: t.announcementId },
      select: { id: true },
    });
    if (!announcement)
      throw new DomainError("VALIDATION", "Check the event", {
        announcementId: ["announcementMissing"],
      });
  }
  // AC-10
  if (!(await mayTarget(ctx.user, t, "ntf.event.write")))
    throw new ForbiddenError("ntf.event.write");
}

/** Local wall-clock strings -> instants. */
function instantsOf(input: EventInput) {
  return {
    startsAt: zonedDateTimeToInstant(input.startsAt),
    endsAt: input.endsAt ? zonedDateTimeToInstant(input.endsAt) : null,
    registrationDeadline: input.registrationDeadline
      ? zonedDateTimeToInstant(input.registrationDeadline)
      : null,
  };
}

/** AC-1/AC-2/AC-10: a new event starts as a draft. */
export async function createEvent(ctx: Ctx, input: EventInput) {
  await checkTarget(ctx, input);
  const times = instantsOf(input);
  const created = await ctx.db.event.create({
    data: {
      title: input.title,
      description: input.description,
      location: input.location,
      ...times,
      capacity: input.capacity,
      audience: input.audience,
      cycle: input.cycle,
      programId: input.programId,
      announcementId: input.announcementId,
      createdById: ctx.user.id,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "ntf.event.create",
    entityType: "Event",
    entityId: created.id,
    before: null,
    after: snapshot({ ...input, ...times, status: "DRAFT" }),
  });
  return { eventId: created.id };
}

export async function updateEvent(ctx: Ctx, id: string, input: EventInput) {
  const before = await getEvent(id, ctx.db);
  if (!before) throw new DomainError("NOT_FOUND", "Event not found");
  // both the old and the new audience must be within the organiser's reach
  await checkTarget(ctx, before);
  await checkTarget(ctx, input);
  if (before.status === "CANCELLED") throw new DomainError("CONFLICT", "EVENT_CANCELLED");
  const times = instantsOf(input);
  await ctx.db.event.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description,
      location: input.location,
      ...times,
      capacity: input.capacity,
      audience: input.audience,
      cycle: input.cycle,
      programId: input.programId,
      announcementId: input.announcementId,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "ntf.event.update",
    entityType: "Event",
    entityId: id,
    before: snapshot(before),
    after: snapshot({ ...input, ...times, status: before.status }),
  });
  return { eventId: id };
}

/** AC-3: only a draft is published; a cancelled event cannot be republished. */
export async function publishEvent(ctx: Ctx, id: string) {
  const before = await getEvent(id, ctx.db);
  if (!before) throw new DomainError("NOT_FOUND", "Event not found");
  await checkTarget(ctx, before);
  if (before.status !== "DRAFT") throw new DomainError("CONFLICT", "NOT_DRAFT");
  await ctx.db.event.update({
    where: { id },
    data: { status: "PUBLISHED", updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: "ntf.event.publish",
    entityType: "Event",
    entityId: id,
    before: { status: "DRAFT" },
    after: { status: "PUBLISHED" },
  });
  return { eventId: id };
}

/** AC-9: cancel a published event and tell everybody registered, once. */
export async function cancelEvent(ctx: Ctx, id: string) {
  const before = await getEvent(id, ctx.db);
  if (!before) throw new DomainError("NOT_FOUND", "Event not found");
  await checkTarget(ctx, before);
  if (before.status !== "PUBLISHED") throw new DomainError("CONFLICT", "NOT_PUBLISHED");
  await ctx.db.event.update({
    where: { id },
    data: { status: "CANCELLED", updatedById: ctx.user.id },
  });
  const registered = await ctx.db.eventRegistration.findMany({
    where: { eventId: id, status: "REGISTERED" },
    select: { userId: true },
    orderBy: { id: "asc" },
  });
  for (const r of registered)
    await notify(
      { db: ctx.db, afterCommit: ctx.afterCommit },
      {
        userId: r.userId,
        type: "ntf.event-cancelled",
        params: { title: before.title, when: whenText(before.startsAt) },
        link: `/events/${id}`,
        dedupeKey: `event-cancelled:${id}`,
      },
    );
  await ctx.audit({
    action: "ntf.event.cancel",
    entityType: "Event",
    entityId: id,
    before: { status: "PUBLISHED" },
    after: { status: "CANCELLED", notified: registered.length },
  });
  return { eventId: id, notified: registered.length };
}

/**
 * AC-4/AC-5/AC-7: register the signed-in user. The event row is locked first, so two people taking
 * the last place are serialised and the count below is exact.
 */
export async function registerForEvent(ctx: Ctx, id: string, now = new Date()) {
  // Visibility first, WITHOUT the lock: it may use other database connections (audience
  // resolvers), and waiting for the lock while holding a connection could starve the pool.
  const event = await registrableEvent(ctx.user.id, id, ctx.db);
  if (!event) throw new DomainError("NOT_FOUND", "Event not found");
  // Then the lock: from here on only this transaction's own connection is used.
  await ctx.db.$queryRaw`SELECT id FROM events WHERE id = ${id} FOR UPDATE`;
  const fresh = await ctx.db.event.findUniqueOrThrow({
    where: { id },
    select: { status: true, startsAt: true, registrationDeadline: true, capacity: true },
  });
  const registeredCount = await ctx.db.eventRegistration.count({
    where: { eventId: id, status: "REGISTERED" },
  });
  const existing = await ctx.db.eventRegistration.findUnique({
    where: { eventId_userId: { eventId: id, userId: ctx.user.id } },
  });
  if (existing?.status === "REGISTERED") throw new DomainError("CONFLICT", "ALREADY_REGISTERED");
  const state = registrationState(fresh, registeredCount, now);
  if (state !== "open") throw new DomainError("CONFLICT", state.toUpperCase());
  const registration = await ctx.db.eventRegistration.upsert({
    where: { eventId_userId: { eventId: id, userId: ctx.user.id } },
    create: { eventId: id, userId: ctx.user.id, registeredAt: now },
    update: { status: "REGISTERED", registeredAt: now, cancelledAt: null },
  });
  await notify(
    { db: ctx.db, afterCommit: ctx.afterCommit },
    {
      userId: ctx.user.id,
      type: "ntf.event-registered",
      params: { title: event.title, when: whenText(event.startsAt) },
      link: `/events/${id}`,
      dedupeKey: `event-registered:${id}`,
    },
  );
  await ctx.audit({
    action: "ntf.event.register",
    entityType: "Event",
    entityId: id,
    before: existing ? { status: existing.status } : null,
    after: { registrationId: registration.id, status: "REGISTERED" },
  });
  return { eventId: id };
}

/** AC-6: cancel my registration until the event starts; the row stays. */
export async function unregisterFromEvent(ctx: Ctx, id: string, now = new Date()) {
  const event = await getEvent(id, ctx.db);
  if (!event) throw new DomainError("NOT_FOUND", "Event not found");
  const existing = await ctx.db.eventRegistration.findUnique({
    where: { eventId_userId: { eventId: id, userId: ctx.user.id } },
  });
  if (existing?.status !== "REGISTERED") throw new DomainError("CONFLICT", "NOT_REGISTERED");
  if (!mayUnregister(event, now)) throw new DomainError("CONFLICT", "CANNOT_CANCEL");
  await ctx.db.eventRegistration.update({
    where: { id: existing.id },
    data: { status: "CANCELLED", cancelledAt: now },
  });
  await ctx.audit({
    action: "ntf.event.unregister",
    entityType: "Event",
    entityId: id,
    before: { status: "REGISTERED" },
    after: { status: "CANCELLED" },
  });
  return { eventId: id };
}
