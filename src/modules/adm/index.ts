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
