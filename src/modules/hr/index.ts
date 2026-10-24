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
