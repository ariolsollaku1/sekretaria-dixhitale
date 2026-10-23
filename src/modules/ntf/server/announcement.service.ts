import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { ForbiddenError } from "@/lib/authz/check";
import { zonedDayStart, zonedNextDayStart } from "@/lib/i18n/zone";
import type { AnnouncementInput } from "../domain/schemas";
import { getAnnouncement, mayTarget, type AnnouncementView } from "./announcement.queries";
import { attachFiles } from "./attachments";

type Ctx = ActionContext;

const snapshot = (a: Omit<AnnouncementView, "id" | "programName" | "pushedAt">) => ({
  title: a.title,
  body: a.body,
  status: a.status,
  audience: a.audience,
  cycle: a.cycle,
  programId: a.programId,
  publishAt: a.publishAt,
  expiresAt: a.expiresAt,
  pinned: a.pinned,
  emailPush: a.emailPush,
});

async function checkTarget(ctx: Ctx, t: Pick<AnnouncementView, "audience" | "programId">) {
  if (t.programId) {
    const program = await ctx.db.studyProgram.findUnique({
      where: { id: t.programId },
      select: { id: true },
    });
    if (!program)
      throw new DomainError("VALIDATION", "Check the announcement", {
        programId: ["programRequired"],
      });
  }
  // AC-10
  if (!(await mayTarget(ctx.user, t))) throw new ForbiddenError("ntf.announcement.write");
}

/** Days -> instants. `keepPublishAt` is the stored value used when the author leaves the day blank. */
function windowOf(input: AnnouncementInput, keepPublishAt: Date | null) {
  const publishAt = input.publishDate ? zonedDayStart(input.publishDate) : keepPublishAt;
  const expiresAt = input.expiresDate ? zonedNextDayStart(input.expiresDate) : null;
  return { publishAt, expiresAt };
}

function assertWindow(publishAt: Date | null, expiresAt: Date | null) {
  if (publishAt && expiresAt && expiresAt <= publishAt)
    throw new DomainError("VALIDATION", "Check the dates", {
      expiresDate: ["expiresBeforePublish"],
    });
}

/** AC-1/AC-2/AC-10: a new announcement starts as a draft. */
export async function createAnnouncement(
  ctx: Ctx,
  input: AnnouncementInput,
  fileIds: string[] = [],
) {
  await checkTarget(ctx, input);
  const { publishAt, expiresAt } = windowOf(input, null);
  assertWindow(publishAt, expiresAt);
  const created = await ctx.db.announcement.create({
    data: {
      title: input.title,
      body: input.body,
      audience: input.audience,
      cycle: input.cycle,
      programId: input.programId,
      publishAt,
      expiresAt,
      pinned: input.pinned,
      emailPush: input.emailPush,
      createdById: ctx.user.id,
      updatedById: ctx.user.id,
    },
  });
  await attachFiles(ctx, created.id, fileIds);
  await ctx.audit({
    action: "ntf.announcement.create",
    entityType: "Announcement",
    entityId: created.id,
    before: null,
    after: snapshot({ ...input, status: "DRAFT", publishAt, expiresAt }),
  });
  return { announcementId: created.id };
}

export async function updateAnnouncement(
  ctx: Ctx,
  id: string,
  input: AnnouncementInput,
  fileIds: string[] = [],
) {
  const before = await getAnnouncement(id, ctx.db);
  if (!before) throw new DomainError("NOT_FOUND", "Announcement not found");
  // both the old and the new audience must be within the author's reach
  await checkTarget(ctx, before);
  await checkTarget(ctx, input);
  const { publishAt, expiresAt } = windowOf(input, before.publishAt);
  assertWindow(publishAt, expiresAt);
  // an already pushed announcement cannot ask for a second push
  const emailPush = before.pushedAt ? before.emailPush : input.emailPush;
  await ctx.db.announcement.update({
    where: { id },
    data: {
      title: input.title,
      body: input.body,
      audience: input.audience,
      cycle: input.cycle,
      programId: input.programId,
      publishAt,
      expiresAt,
      pinned: input.pinned,
      emailPush,
      updatedById: ctx.user.id,
    },
  });
  await attachFiles(ctx, id, fileIds);
  await ctx.audit({
    action: "ntf.announcement.update",
    entityType: "Announcement",
    entityId: id,
    before: snapshot(before),
    after: snapshot({ ...input, status: before.status, publishAt, expiresAt, emailPush }),
  });
  return { announcementId: id };
}

/** AC-3: publish a draft or republish an archived one; a blank publish day means "now". */
export async function publishAnnouncement(ctx: Ctx, id: string) {
  const before = await getAnnouncement(id, ctx.db);
  if (!before) throw new DomainError("NOT_FOUND", "Announcement not found");
  await checkTarget(ctx, before);
  if (before.status === "PUBLISHED") throw new DomainError("CONFLICT", "ALREADY_PUBLISHED");
  const publishAt = before.publishAt ?? new Date();
  if (before.expiresAt && before.expiresAt <= publishAt)
    throw new DomainError("VALIDATION", "Check the dates", { expiresDate: ["expiresInPast"] });
  await ctx.db.announcement.update({
    where: { id },
    data: { status: "PUBLISHED", publishAt, updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: "ntf.announcement.publish",
    entityType: "Announcement",
    entityId: id,
    before: { status: before.status, publishAt: before.publishAt },
    after: { status: "PUBLISHED", publishAt },
  });
  return { announcementId: id };
}

/** AC-4: hidden from readers, kept. */
export async function archiveAnnouncement(ctx: Ctx, id: string) {
  const before = await getAnnouncement(id, ctx.db);
  if (!before) throw new DomainError("NOT_FOUND", "Announcement not found");
  await checkTarget(ctx, before);
  if (before.status !== "PUBLISHED") throw new DomainError("CONFLICT", "NOT_PUBLISHED");
  await ctx.db.announcement.update({
    where: { id },
    data: { status: "ARCHIVED", updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: "ntf.announcement.archive",
    entityType: "Announcement",
    entityId: id,
    before: { status: "PUBLISHED" },
    after: { status: "ARCHIVED" },
  });
  return { announcementId: id };
}
