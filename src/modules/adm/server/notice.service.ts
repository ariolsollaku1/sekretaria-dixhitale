import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { announcementSchema, createAnnouncement, updateAnnouncement } from "@/modules/ntf";
import type { NoticeInput } from "../domain/schemas";
import { getNotice, type NoticeView } from "./notice.queries";

type Ctx = ActionContext;
const date = (d: string) => new Date(`${d}T00:00:00Z`);

const snapshot = (
  n: Pick<
    NoticeView,
    | "academicYearId"
    | "programId"
    | "registrationDeadline"
    | "documents"
    | "contractExcerpt"
    | "showFees"
  >,
) => ({
  academicYearId: n.academicYearId,
  programId: n.programId,
  registrationDeadline: n.registrationDeadline,
  documents: n.documents,
  contractExcerpt: n.contractExcerpt,
  showFees: n.showFees,
});

/** AC-2: the year and the program must exist. */
async function checkReferences(ctx: Ctx, input: NoticeInput) {
  const errors: Record<string, string[]> = {};
  const year = await ctx.db.academicYear.findUnique({
    where: { id: input.academicYearId },
    select: { id: true },
  });
  if (!year) errors.academicYearId = ["yearNotFound"];
  if (input.programId) {
    const program = await ctx.db.studyProgram.findUnique({
      where: { id: input.programId },
      select: { id: true },
    });
    if (!program) errors.programId = ["programNotFound"];
  }
  if (Object.keys(errors).length) throw new DomainError("VALIDATION", "Check the notice", errors);
}

/** The announcement half of a notice: audience is always ALL (Q-98). */
const announcementOf = (input: NoticeInput) =>
  announcementSchema.parse({
    title: input.title,
    body: input.body,
    audience: "ALL",
    publishDate: input.publishDate,
    expiresDate: input.expiresDate,
    pinned: input.pinned,
    emailPush: input.emailPush,
  });

/** AC-1/AC-3/AC-9: a notice starts as a draft announcement plus its campaign data, in one transaction. */
export async function createNotice(ctx: Ctx, input: NoticeInput) {
  await checkReferences(ctx, input);
  const { announcementId } = await createAnnouncement(ctx, announcementOf(input));
  const created = await ctx.db.registrationNotice.create({
    data: {
      announcementId,
      academicYearId: input.academicYearId,
      programId: input.programId,
      registrationDeadline: date(input.registrationDeadline),
      documents: input.documents,
      contractExcerpt: input.contractExcerpt,
      showFees: input.showFees,
      createdById: ctx.user.id,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "adm.notice.create",
    entityType: "RegistrationNotice",
    entityId: created.id,
    before: null,
    after: snapshot(input),
  });
  return { noticeId: created.id, announcementId };
}

export async function updateNotice(ctx: Ctx, noticeId: string, input: NoticeInput) {
  const before = await getNotice(noticeId, ctx.db);
  if (!before) throw new DomainError("NOT_FOUND", "Notice not found");
  await checkReferences(ctx, input);
  await updateAnnouncement(ctx, before.announcementId, announcementOf(input));
  await ctx.db.registrationNotice.update({
    where: { id: noticeId },
    data: {
      academicYearId: input.academicYearId,
      programId: input.programId,
      registrationDeadline: date(input.registrationDeadline),
      documents: input.documents,
      contractExcerpt: input.contractExcerpt,
      showFees: input.showFees,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "adm.notice.update",
    entityType: "RegistrationNotice",
    entityId: noticeId,
    before: snapshot(before),
    after: snapshot(input),
  });
  return { noticeId, announcementId: before.announcementId };
}
