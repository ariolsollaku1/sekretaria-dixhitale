// Public surface of the STU module: other code imports only from here.
import "./permissions";
import "./server/student-dependents";
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
