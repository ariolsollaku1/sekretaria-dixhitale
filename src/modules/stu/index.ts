// Public surface of the STU module: other code imports only from here.
import "./permissions";
import "./server/student-dependents";
import "./server/audience";
import "./server/home-widget";
export { studentsTable } from "./server/student.table";
export { StudentForm } from "./ui/student-form";
export { AddEnrollment, RegisterYear, ChangeGroup } from "./ui/enrollment-manager";
export {
  getStudent,
  getOwnStudent,
  listCohortOptions,
  listGroupOptions,
  type StudentView,
  type EnrollmentRecord,
} from "./server/student.queries";
import "./server/status-notification";
export {
  registerStatusChangeHandler,
  resetStatusChangeHandlers,
  type StatusChangeEvent,
} from "./server/status-hooks";
export { StatusChange } from "./ui/status-change";
export { allowedTransitions } from "./domain/status-rules";
export { studentListsTable } from "./server/lists.table";
export { statRecords, type StatFilters } from "./server/stat.queries";
export { TRANSLATED as STAT_TRANSLATED } from "./server/stat.format";
export { pivot, isDimension, DIMENSIONS, type Dimension } from "./domain/stat-rules";
export { getPortalHome, type PortalHome, type HomeEnrollment } from "./server/home.queries";
export { PortalHomeView } from "./ui/portal-home";
import "./server/request-handlers";
export {
  getRecognitionPanel,
  listRecognizedCourses,
  type RecognitionPanel,
} from "./server/recognition.queries";
export { REQUEST_FORMS } from "./domain/request-forms";
