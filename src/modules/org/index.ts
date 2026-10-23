// Public surface of the ORG module: other code imports only from here.
import "./permissions";
import "./server/year.provider";
import "./server/scope-resolvers";

export { YearForm } from "./ui/year-form";
export { UnitForm } from "./ui/unit-form";
export { UnitStatusActions } from "./ui/unit-status-actions";
export { ProgramForm } from "./ui/program-form";
export { MakeCurrentButton } from "./ui/make-current-button";
export { yearsTable } from "./server/year.table";
export { facultiesTable } from "./server/faculty.table";
export { departmentsTable } from "./server/department.table";
export { programsTable } from "./server/program.table";
export {
  getProgram,
  getProgramConfig,
  getProgramCoordinators,
  listSubtypes,
  listDepartmentOptions,
} from "./server/program.queries";
export {
  registerProgramDependent,
  blockingDependents,
  type ProgramDependent,
} from "./server/program-dependents";
export {
  getFaculty,
  getDepartment,
  getDepartmentHeads,
  listFacultyOptions,
} from "./server/unit.queries";
export {
  getYear,
  getCurrentAcademicYear,
  isYearWritable,
  assertYearWritable,
  YearClosedError,
  listYearOptions,
  type YearView,
} from "./server/year.queries";
export {
  registerYearChecklistItem,
  allChecklistItems,
  visibleChecklist,
  type ChecklistItem,
} from "./server/rollover";
