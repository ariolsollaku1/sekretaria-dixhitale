import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import { resolveAudience } from "./audience";

type Client = Pick<Tx, "calendarEvent" | "userRole">;

export type EventView = {
  id: string;
  academicYearId: string;
  title: string;
  type: "TEACHING_WEEK" | "HOLIDAY" | "DEADLINE" | "EXAM_PERIOD" | "REGISTRATION_PERIOD" | "EVENT";
  startDate: string;
  endDate: string;
  description: string | null;
  audience: "ALL" | "CYCLE" | "PROGRAM";
  cycle: "FIRST" | "SECOND" | null;
  programId: string | null;
  programName: string | null;
  active: boolean;
};

const toDay = (d: Date) => d.toISOString().slice(0, 10);

type Row = Prisma.CalendarEventGetPayload<{ include: { program: { select: { name: true } } } }>;
const include = { program: { select: { name: true } } } as const;

function view(e: Row): EventView {
  return {
    id: e.id,
    academicYearId: e.academicYearId,
    title: e.title,
    type: e.type,
    startDate: toDay(e.startDate),
    endDate: toDay(e.endDate),
    description: e.description,
    audience: e.audience,
    cycle: e.cycle,
    programId: e.programId,
    programName: e.program?.name ?? null,
    active: e.active,
  };
}

/**
 * AC-9: staff (any role other than student) see every event; a student-only user sees `ALL` plus
 * the cycles/programs the registered resolvers give them. Returns the extra `where` clause.
 */
export async function audienceFilter(
  userId: string,
  client: Client = db,
): Promise<Prisma.CalendarEventWhereInput> {
  const now = new Date();
  const roles = await client.userRole.findMany({
    where: { userId, OR: [{ validTo: null }, { validTo: { gt: now } }], validFrom: { lte: now } },
    select: { role: true },
  });
  if (roles.some((r) => r.role !== "student")) return {};
  const mine = await resolveAudience(userId);
  return {
    OR: [
      { audience: "ALL" },
      ...(mine.cycles.length ? [{ audience: "CYCLE" as const, cycle: { in: mine.cycles } }] : []),
      ...(mine.programIds.length
        ? [{ audience: "PROGRAM" as const, programId: { in: mine.programIds } }]
        : []),
    ],
  };
}

/** Events of one year for a viewer; cancelled ones only when `includeCancelled` (writers). */
export async function listEvents(opts: {
  yearId: string;
  viewerId: string;
  includeCancelled: boolean;
}): Promise<EventView[]> {
  const rows = await db.calendarEvent.findMany({
    where: {
      academicYearId: opts.yearId,
      ...(opts.includeCancelled ? {} : { active: true }),
      ...(await audienceFilter(opts.viewerId)),
    },
    include,
    orderBy: [{ startDate: "asc" }, { endDate: "asc" }, { title: "asc" }],
  });
  return rows.map(view);
}

export async function getEvent(id: string, client: Client = db): Promise<EventView | null> {
  const e = await client.calendarEvent.findUnique({ where: { id }, include });
  return e ? view(e) : null;
}

/** AC-12: what a user's feed lists — active events of the current and planned years. */
export async function feedEvents(viewerId: string): Promise<EventView[]> {
  const rows = await db.calendarEvent.findMany({
    where: {
      active: true,
      academicYear: { status: { in: ["CURRENT", "PLANNED"] } },
      ...(await audienceFilter(viewerId)),
    },
    include,
    orderBy: [{ startDate: "asc" }],
  });
  return rows.map(view);
}
