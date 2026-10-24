// Public surface of the ADM module: other code imports only from here.
import "./permissions";
export {
  getNotice,
  getNoticeByAnnouncement,
  listNotices,
  noticeDetail,
  liveRegistrationNotices,
  type NoticeView,
  type NoticeDetail,
} from "./server/notice.queries";
export { NoticeForm } from "./ui/notice-form";
export { RegistrationSection } from "./ui/registration-section";
export { daysUntil, windowState } from "./domain/deadline";
export { applicationsTable } from "./server/application.table";
export { registerAdmPurposes } from "./server/purposes";
export {
  getApplicationByToken,
  uploadDocument,
  type StatusView,
  type UploadResult,
} from "./server/application.service";
export {
  getApplicationDetail,
  listCycles,
  openOffer,
  type ApplicationDetail,
  type CycleView,
} from "./server/application.queries";
export { CycleForm, type CycleDraft } from "./ui/cycle-form";
export { ApplyForm } from "./ui/apply-form";
export { DocumentUpload } from "./ui/document-upload";
export { LinkRequestForm } from "./ui/link-request-form";
export { PublicShell } from "./ui/public-shell";
