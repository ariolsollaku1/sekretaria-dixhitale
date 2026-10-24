// Public surface of the ATT module: other code imports only from here.
import "./permissions";
export {
  ownSessions,
  groupSessions,
  getSessionDetail,
  ownAbsences,
  getWindowDays,
  rosterOf,
  type RosterStudent,
  type SessionView,
  type SessionDetail,
  type AbsenceView,
} from "./server/session.queries";
export { sessionsForHours, type HoursSession } from "./server/hours.queries";
export { attReportTable, attSummaryTable } from "./server/report.tables";
export { ownSummary, getThreshold, type OwnCourseSummary } from "./server/report.queries";
export { OwnSummary } from "./ui/own-summary";
export { SessionForms } from "./ui/session-forms";
export { SessionList } from "./ui/session-list";
export { AttendanceForm } from "./ui/attendance-form";
export {
  addDays,
  clampDay,
  defaultHours,
  formatTime,
  isoWeekday,
  todayInTirane,
} from "./domain/session-rules";
