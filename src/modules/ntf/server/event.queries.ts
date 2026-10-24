import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { grantScopes, can } from "@/lib/authz/guard";
import { db, type Tx } from "@/lib/db";
import { isUpcoming, type EventStatus } from "../domain/event-rules";
import { matchesViewer, type Viewer } from "../domain/visibility";
import { manageWhere, mayTarget, viewerOf, writableProgramIds } from "./announcement.queries";

export type EventView = {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date | null;
  capacity: number | null;
  registrationDeadline: Date | null;
  status: EventStatus;
  audience: "ALL" | "STAFF" | "STUDENTS" | "CYCLE" | "PROGRAM";
  cycle: "FIRST" | "SECOND" | null;
  programId: string | null;
  programName: string | null;
  announcementId: string | null;
  announcementTitle: string | null;
  remindedAt: Date | null;
  /** people currently registered (status REGISTERED) */
  registeredCount: number;
};

const include = {
  program: { select: { name: true } },
  announcement: { select: { title: true } },
  _count: { select: { registrations: { where: { status: "REGISTERED" as const } } } },
} satisfies Prisma.EventInclude;
type Row = Prisma.EventGetPayload<{ include: typeof include }>;

const view = (e: Row): EventView => ({
  id: e.id,
  title: e.title,
  description: e.description,
  location: e.location,
  startsAt: e.startsAt,
  endsAt: e.endsAt,
  capacity: e.capacity,
  registrationDeadline: e.registrationDeadline,
  status: e.status,
  audience: e.audience,
  cycle: e.cycle,
  programId: e.programId,
  programName: e.program?.name ?? null,
  announcementId: e.announcementId,
  announcementTitle: e.announcement?.title ?? null,
  remindedAt: e.remindedAt,
  registeredCount: e._count.registrations,
});

/** The database form of `matchesViewer` for events. */
export function eventAudienceWhere(v: Viewer): Prisma.EventWhereInput {
  const or: Prisma.EventWhereInput[] = [{ audience: "ALL" }];
  if (v.staff) or.push({ audience: "STAFF" });
  if (v.staff || v.student) or.push({ audience: "STUDENTS" });
  if (v.staff) or.push({ audience: { in: ["CYCLE", "PROGRAM"] } });
  else {
    if (v.cycles.length) or.push({ audience: "CYCLE", cycle: { in: [...v.cycles] } });
    if (v.programIds.length) or.push({ audience: "PROGRAM", programId: { in: [...v.programIds] } });
  }
  return { OR: or };
}

/** AC-10/AC-11: an organiser manages events for audiences they could address. */
export const mayManageEvent = async (
  user: { id: string },
  e: Pick<EventView, "audience" | "programId">,
) => (await can(user, "ntf.event.write")) && (await mayTarget(user, e, "ntf.event.write"));

export async function manageEventWhere(user: { id: string }): Promise<Prisma.EventWhereInput> {
  const g = await grantScopes(user, "ntf.event.write");
  if (g.institution) return {};
  return {
    audience: "PROGRAM",
    programId: { in: await writableProgramIds(user, "ntf.event.write") },
  };
}

export async function getEvent(id: string, client: Pick<Tx, "event"> = db) {
  const row = await client.event.findUnique({ where: { id }, include });
  return row ? view(row) : null;
}

export type ListedEvent = EventView & { myStatus: "REGISTERED" | "CANCELLED" | null };

/** AC-3: published and cancelled events whose audience matches; upcoming first (soonest first), then past (latest first). */
export async function listEvents(userId: string, now = new Date()) {
  const viewer = await viewerOf(userId);
  const rows = await db.event.findMany({
    where: { AND: [{ status: { in: ["PUBLISHED", "CANCELLED"] } }, eventAudienceWhere(viewer)] },
    include: { ...include, registrations: { where: { userId }, select: { status: true } } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });
  const all: ListedEvent[] = rows.map((r) => ({
    ...view(r),
    myStatus: r.registrations[0]?.status ?? null,
  }));
  return {
    upcoming: all.filter((e) => isUpcoming(e.startsAt, e.endsAt, now)),
    past: all
      .filter((e) => !isUpcoming(e.startsAt, e.endsAt, now))
      .reverse()
      .slice(0, 20),
  };
}

/** AC-3/AC-4: null when the event does not exist or the user may not see it (organisers see their scope, drafts included). */
export async function visibleEvent(
  userId: string,
  id: string,
  client: Pick<Tx, "event" | "userRole"> = db,
): Promise<EventView | null> {
  const row = await client.event.findUnique({ where: { id }, include });
  if (!row) return null;
  const e = view(row);
  if (await mayManageEvent({ id: userId }, e)) return e;
  if (e.status === "DRAFT") return null;
  return matchesViewer(e, await viewerOf(userId, client)) ? e : null;
}

/**
 * AC-4: the event as a registrant sees it (no draft, audience must match). Unlike `visibleEvent`
 * it asks nothing of the global client except the audience resolvers, so it is cheap to run inside
 * the registration transaction.
 */
export async function registrableEvent(
  userId: string,
  id: string,
  client: Pick<Tx, "event" | "userRole">,
): Promise<EventView | null> {
  const row = await client.event.findUnique({ where: { id }, include });
  if (!row || row.status === "DRAFT") return null;
  const e = view(row);
  return matchesViewer(e, await viewerOf(userId, client)) ? e : null;
}

export async function myRegistration(userId: string, eventId: string) {
  return db.eventRegistration.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { status: true },
  });
}

/** AC-1: announcements an organiser may link an event to (their own scope, newest first). */
export async function listAnnouncementOptions(user: { id: string }) {
  const rows = await db.announcement.findMany({
    where: await manageWhere(user),
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, title: true },
  });
  return rows.map((a) => ({ id: a.id, label: a.title }));
}
