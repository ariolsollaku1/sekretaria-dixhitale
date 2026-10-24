// Public surface of the HR module: other code imports only from here.
import "./permissions";
export { staffTable } from "./server/staff.table";
export { StaffForm } from "./ui/staff-form";
export { StaffStatusActions } from "./ui/staff-status-actions";
export { StaffImport } from "./ui/staff-import";
export { TEMPLATE_CSV } from "./domain/import";
export {
  getStaff,
  getOwnStaff,
  listDepartmentOptions,
  type StaffView,
} from "./server/staff.queries";
export {
  listLecturerOptions,
  getStaffBriefs,
  getOwnStaffId,
  type StaffBrief,
} from "./server/staff-lookup";
export { contractsTable } from "./server/contract.table";
import "./server/contract.job";
export { lecturersTable } from "./server/lecturers.table";
export { TeachingHubView, TeachingSummary } from "./ui/teaching-hub";
export {
  getTeachingHub,
  getAssignmentRoster,
  type TeachingHub,
  type AssignmentRoster,
} from "./server/teaching.queries";
import "./server/teaching-widget";
export { registerStaffActiveHandler, type StaffActiveEvent } from "./server/staff-hooks";
import "./server/staff-resolver";
export { hoursTable, hoursReportTable } from "./server/hours.tables";
export {
  getMonthDetail,
  getOwnHours,
  courseRows,
  totalsByCategory,
  type MonthDetail,
  type OwnHours,
} from "./server/hours.queries";
export { HoursMonthView, MonthList } from "./ui/hours-view";
export { HoursActions } from "./ui/hours-actions";
// HR-06 performance evaluations
import "./evaluation-permissions";
export { evaluationsTable } from "./server/evaluation.table";
export {
  listCampaigns,
  getCampaignView,
  listEvaluatorOptions,
  myEvaluations,
  getEvaluationToFill,
  ownResults,
  type CampaignRow,
  type CampaignView,
  type MyEvaluation,
  type OwnResult,
} from "./server/evaluation.queries";
export { REPORT_LEVELS, type ReportLevel } from "./domain/evaluation-rules";
export { OpenCampaignForm, CloseCampaignButton, AssignEvaluator } from "./ui/campaign-forms";
export { EvaluationForm } from "./ui/evaluation-form";
