"use server";

import "../permissions";
import { action } from "@/lib/actions";
import {
  createAnnouncementSchema,
  publishSchema,
  removeFileSchema,
  updateAnnouncementSchema,
} from "../domain/schemas";
import * as announcements from "./announcement.service";
import { removeAttachment } from "./attachments";

export const createAnnouncementAction = action({
  permission: "ntf.announcement.write",
  input: createAnnouncementSchema,
  handler: ({ fileIds, ...input }, ctx) => announcements.createAnnouncement(ctx, input, fileIds),
});

export const updateAnnouncementAction = action({
  permission: "ntf.announcement.write",
  input: updateAnnouncementSchema,
  handler: ({ announcementId, fileIds, ...input }, ctx) =>
    announcements.updateAnnouncement(ctx, announcementId, input, fileIds),
});

export const publishAnnouncementAction = action({
  permission: "ntf.announcement.write",
  input: publishSchema,
  handler: ({ announcementId }, ctx) => announcements.publishAnnouncement(ctx, announcementId),
});

export const archiveAnnouncementAction = action({
  permission: "ntf.announcement.write",
  input: publishSchema,
  handler: ({ announcementId }, ctx) => announcements.archiveAnnouncement(ctx, announcementId),
});

export const removeAttachmentAction = action({
  permission: "ntf.announcement.write",
  input: removeFileSchema,
  handler: ({ announcementId, fileId }, ctx) => removeAttachment(ctx, announcementId, fileId),
});
