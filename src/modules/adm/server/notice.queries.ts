import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import { zonedDay } from "@/lib/i18n/zone";
import { feeSummary } from "@/modules/fin";

type Client = Pick<Tx, "registrationNotice">;

const include = {
  announcement: true,
  academicYear: { select: { code: true } },
  program: { select: { code: true, name: true } },
} as const;
type Row = Prisma.RegistrationNoticeGetPayload<{ include: typeof include }>;

export type NoticeView = {
  id: string;
  announcementId: string;
  title: string;
  body: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  academicYearId: string;
  yearCode: string;
  programId: string | null;
  programLabel: string | null;
  /** YYYY-MM-DD */
  registrationDeadline: string;
  documents: string[];
  contractExcerpt: string;
  showFees: boolean;
  publishDate: string;
  expiresDate: string;
  pinned: boolean;
  emailPush: boolean;
};

const view = (n: Row): NoticeView => ({
  id: n.id,
  announcementId: n.announcementId,
  title: n.announcement.title,
  body: n.announcement.body,
  status: n.announcement.status,
  academicYearId: n.academicYearId,
  yearCode: n.academicYear.code,
  programId: n.programId,
  programLabel: n.program ? `${n.program.code} — ${n.program.name}` : null,
  registrationDeadline: n.registrationDeadline.toISOString().slice(0, 10),
  documents: n.documents,
  contractExcerpt: n.contractExcerpt,
  showFees: n.showFees,
  publishDate: n.announcement.publishAt ? zonedDay(n.announcement.publishAt) : "",
  // the stored expiry is the start of the day after the last visible day
  expiresDate: n.announcement.expiresAt
    ? zonedDay(new Date(n.announcement.expiresAt.getTime() - 1))
    : "",
  pinned: n.announcement.pinned,
  emailPush: n.announcement.emailPush,
});

export async function getNotice(id: string, client: Client = db): Promise<NoticeView | null> {
  const row = await client.registrationNotice.findUnique({ where: { id }, include });
  return row ? view(row) : null;
}

export async function getNoticeByAnnouncement(
  announcementId: string,
  client: Client = db,
): Promise<NoticeView | null> {
  const row = await client.registrationNotice.findUnique({ where: { announcementId }, include });
  return row ? view(row) : null;
}

/** AC-7: the writers' list, newest deadline first. */
export async function listNotices(): Promise<NoticeView[]> {
  const rows = await db.registrationNotice.findMany({
    include,
    orderBy: [{ registrationDeadline: "desc" }, { id: "desc" }],
  });
  return rows.map(view);
}

export type NoticeDetail = NoticeView & {
  fees: Awaited<ReturnType<typeof feeSummary>>;
};

/** AC-4: the notice with the live fee schedule of its year (only when `showFees`). */
export async function noticeDetail(view: NoticeView): Promise<NoticeDetail> {
  return {
    ...view,
    fees: view.showFees ? await feeSummary(view.academicYearId, view.programId) : [],
  };
}

/**
 * AC-8: published, currently visible, audience-ALL registration notices, with no user. For the
 * public application page (ADM-02) and lead mailings (ADM-01). Newest deadline first.
 */
export async function liveRegistrationNotices(now = new Date()): Promise<NoticeDetail[]> {
  const rows = await db.registrationNotice.findMany({
    where: {
      announcement: {
        status: "PUBLISHED",
        audience: "ALL",
        publishAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    },
    include,
    orderBy: [{ announcement: { pinned: "desc" } }, { registrationDeadline: "desc" }],
  });
  return Promise.all(rows.map((r) => noticeDetail(view(r))));
}
