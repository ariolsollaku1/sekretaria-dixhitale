import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { ForbiddenError } from "@/lib/authz/check";
import { db } from "@/lib/db";
import { attachFile, FileError, removeFile } from "@/lib/files/files.service";
import { MIME } from "@/lib/files/mime";
import { DEFAULT_LIMITS, getFilePurpose, registerFilePurpose } from "@/lib/files/purposes";
import { MAX_ATTACHMENTS } from "../domain/schemas";
import { getAnnouncement, mayManage, visibleAnnouncement } from "./announcement.queries";

export const ATTACHMENT_PURPOSE = "announcement-attachment";
export const ENTITY_TYPE = "Announcement";

/** AC-9: office documents and images up to the platform limit; readable by whoever can see the notice. */
export function registerNtfPurposes(): void {
  if (getFilePurpose(ATTACHMENT_PURPOSE)) return;
  registerFilePurpose({
    id: ATTACHMENT_PURPOSE,
    uploadPermission: "ntf.announcement.write",
    maxBytes: DEFAULT_LIMITS.maxBytes,
    mimeTypes: [...DEFAULT_LIMITS.mimeTypes, MIME.docx, MIME.xlsx],
    canRead: async (user, file) =>
      file.entityType === ENTITY_TYPE &&
      !!file.entityId &&
      !!(await visibleAnnouncement(user.id, file.entityId)),
  });
}

/** AC-9: bind uploaded files to the announcement; at most MAX_ATTACHMENTS in total. */
export async function attachFiles(ctx: ActionContext, announcementId: string, fileIds: string[]) {
  if (fileIds.length === 0) return;
  const current = await ctx.db.storedFile.count({
    where: { entityType: ENTITY_TYPE, entityId: announcementId, deletedAt: null },
  });
  if (current + fileIds.length > MAX_ATTACHMENTS)
    throw new DomainError("VALIDATION", "Too many files", { fileIds: ["tooManyFiles"] });
  for (const fileId of fileIds) {
    const file = await ctx.db.storedFile.findUnique({
      where: { id: fileId },
      select: { purpose: true, uploadedById: true },
    });
    // only the uploader's own pending files of this purpose can be attached
    if (!file || file.purpose !== ATTACHMENT_PURPOSE || file.uploadedById !== ctx.user.id)
      throw new DomainError("NOT_FOUND", "File not found");
    try {
      await attachFile(ctx, fileId, { entityType: ENTITY_TYPE, entityId: announcementId });
    } catch (error) {
      if (error instanceof FileError)
        throw new DomainError(error.code === "NOT_FOUND" ? "NOT_FOUND" : "CONFLICT", error.code);
      throw error;
    }
  }
}

export async function removeAttachment(ctx: ActionContext, announcementId: string, fileId: string) {
  const announcement = await getAnnouncement(announcementId, ctx.db);
  if (!announcement) throw new DomainError("NOT_FOUND", "Announcement not found");
  if (!(await mayManage(ctx.user, announcement)))
    throw new ForbiddenError("ntf.announcement.write");
  const file = await ctx.db.storedFile.findUnique({
    where: { id: fileId },
    select: { entityType: true, entityId: true, deletedAt: true },
  });
  if (
    !file ||
    file.deletedAt ||
    file.entityType !== ENTITY_TYPE ||
    file.entityId !== announcementId
  )
    throw new DomainError("NOT_FOUND", "File not found");
  await removeFile(ctx, fileId, "Removed from announcement");
  return { fileId };
}

export async function listAttachments(announcementId: string) {
  return db.storedFile.findMany({
    where: {
      entityType: ENTITY_TYPE,
      entityId: announcementId,
      deletedAt: null,
      status: "ATTACHED",
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, fileName: true, mimeType: true, size: true },
  });
}
