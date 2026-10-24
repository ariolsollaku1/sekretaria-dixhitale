import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { resolveAudience } from "@/lib/audience";
import { can, grantScopes } from "@/lib/authz/guard";
import { db, type Tx } from "@/lib/db";
import { matchesViewer, type Viewer } from "../domain/visibility";

type Client = Pick<Tx, "userRole">;
/** The write permissions that share the audience rules (NTF-01 announcements, NTF-02 events). */
export type WritePermission = "ntf.announcement.write" | "ntf.event.write";

export const PAGE_SIZE = 10;

export type AnnouncementView = {
  id: string;
  title: string;
  body: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  audience: "ALL" | "STAFF" | "STUDENTS" | "CYCLE" | "PROGRAM";
  cycle: "FIRST" | "SECOND" | null;
  programId: string | null;
  programName: string | null;
  publishAt: Date | null;
  expiresAt: Date | null;
  pinned: boolean;
  emailPush: boolean;
  pushedAt: Date | null;
};

const include = { program: { select: { name: true } } } as const;
type Row = Prisma.AnnouncementGetPayload<{ include: typeof include }>;
const view = (a: Row): AnnouncementView => ({
  id: a.id,
  title: a.title,
  body: a.body,
  status: a.status,
  audience: a.audience,
  cycle: a.cycle,
  programId: a.programId,
  programName: a.program?.name ?? null,
  publishAt: a.publishAt,
  expiresAt: a.expiresAt,
  pinned: a.pinned,
  emailPush: a.emailPush,
  pushedAt: a.pushedAt,
});

/** What the viewer is: staff and/or student, plus the cycles and programs the resolvers give them. */
export async function viewerOf(userId: string, client: Client = db): Promise<Viewer> {
  const now = new Date();
  const roles = await client.userRole.findMany({
    where: { userId, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
    select: { role: true },
  });
  const mine = await resolveAudience(userId);
  return {
    staff: roles.some((r) => r.role !== "student"),
    student: roles.some((r) => r.role === "student"),
    cycles: mine.cycles,
    programIds: mine.programIds,
  };
}

/** The database form of `matchesViewer` (kept equal by a test). */
export function audienceWhere(v: Viewer): Prisma.AnnouncementWhereInput {
  const or: Prisma.AnnouncementWhereInput[] = [{ audience: "ALL" }];
  if (v.staff) or.push({ audience: "STAFF" });
  if (v.staff || v.student) or.push({ audience: "STUDENTS" });
  if (v.staff) or.push({ audience: { in: ["CYCLE", "PROGRAM"] } });
  else {
    if (v.cycles.length) or.push({ audience: "CYCLE", cycle: { in: [...v.cycles] } });
    if (v.programIds.length) or.push({ audience: "PROGRAM", programId: { in: [...v.programIds] } });
  }
  return { OR: or };
}

const liveWhere = (now: Date): Prisma.AnnouncementWhereInput => ({
  status: "PUBLISHED",
  publishAt: { lte: now },
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

/** AC-5: pinned first, then newest first. */
export async function feed(userId: string, page: number, now = new Date()) {
  const viewer = await viewerOf(userId);
  const where: Prisma.AnnouncementWhereInput = { AND: [liveWhere(now), audienceWhere(viewer)] };
  const [total, rows] = await Promise.all([
    db.announcement.count({ where }),
    db.announcement.findMany({
      where,
      include,
      orderBy: [{ pinned: "desc" }, { publishAt: "desc" }, { id: "desc" }],
      skip: (Math.max(1, page) - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { total, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)), rows: rows.map(view) };
}

/** AC-6: null when the announcement does not exist or is not visible to this user (writers see their own scope). */
export async function visibleAnnouncement(
  userId: string,
  id: string,
  now = new Date(),
): Promise<AnnouncementView | null> {
  const row = await db.announcement.findUnique({ where: { id }, include });
  if (!row) return null;
  const a = view(row);
  if (await mayManage({ id: userId }, a)) return a;
  const live =
    row.status === "PUBLISHED" &&
    !!row.publishAt &&
    row.publishAt <= now &&
    (!row.expiresAt || row.expiresAt > now);
  return live && matchesViewer(a, await viewerOf(userId)) ? a : null;
}

/** Programs a writer may publish to: their program grants plus the programs of their departments/faculties. */
export async function writableProgramIds(
  user: { id: string },
  permission: WritePermission = "ntf.announcement.write",
): Promise<string[]> {
  const g = await grantScopes(user, permission);
  if (g.institution)
    return (await db.studyProgram.findMany({ select: { id: true } })).map((p) => p.id);
  const rows = await db.studyProgram.findMany({
    where: {
      OR: [
        { id: { in: g.programIds } },
        { departmentId: { in: g.departmentIds } },
        { department: { facultyId: { in: g.facultyIds } } },
      ],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** AC-10: may this user publish to this audience? */
export async function mayTarget(
  user: { id: string },
  t: { audience: AnnouncementView["audience"]; programId: string | null },
  permission: WritePermission = "ntf.announcement.write",
): Promise<boolean> {
  if (t.audience === "PROGRAM")
    return !!t.programId && (await can(user, permission, { kind: "program", id: t.programId }));
  return (await grantScopes(user, permission)).institution;
}

/** AC-10/AC-11: a writer manages announcements for audiences they could publish to. */
export const mayManage = async (
  user: { id: string },
  a: Pick<AnnouncementView, "audience" | "programId">,
) => (await can(user, "ntf.announcement.write")) && (await mayTarget(user, a));

export async function manageWhere(user: { id: string }): Promise<Prisma.AnnouncementWhereInput> {
  const g = await grantScopes(user, "ntf.announcement.write");
  if (g.institution) return {};
  return { audience: "PROGRAM", programId: { in: await writableProgramIds(user) } };
}

export async function getAnnouncement(id: string, client: Pick<Tx, "announcement"> = db) {
  const row = await client.announcement.findUnique({ where: { id }, include });
  return row ? view(row) : null;
}
