// Public surface of the NTF module: other code imports only from here.
import "./permissions";
import "./server/types";
import "./server/push";
export { registerNtfPurposes, ATTACHMENT_PURPOSE } from "./server/attachments";
export { announcementsTable } from "./server/announcement.table";
export { AnnouncementForm } from "./ui/announcement-form";
export { AnnouncementStatusActions } from "./ui/status-actions";
export {
  feed,
  visibleAnnouncement,
  mayManage,
  getAnnouncement,
  type AnnouncementView,
} from "./server/announcement.queries";
export { listAttachments } from "./server/attachments";
// ADM-06 builds registration notices on top of announcements
export {
  createAnnouncement,
  updateAnnouncement,
  publishAnnouncement,
} from "./server/announcement.service";
export { announcementSchema } from "./domain/schemas";
export { listProgramOptions } from "./server/program-options";
export { uploadConfig } from "./server/attachments";
// NTF-03 messaging
import "./server/message.job";
export { messagesTable } from "./server/message.table";
export { resolveRecipients, sourceExportName } from "./server/recipients";
export {
  getMessageDetail,
  getDeliveryLog,
  listTemplates,
  type MessageDetail,
  type LogRow,
  type TemplateRow,
} from "./server/message.queries";
export { MessageForm } from "./ui/message-form";
export { TemplateForm } from "./ui/template-form";
export { TemplateArchive } from "./ui/template-archive";
export { MessageThesePeople } from "./ui/message-link";
