// Public surface of the ORG module: other code imports only from here.
import "./permissions";
import "./server/year.provider";
import "./server/scope-resolvers";
import "./server/cohort-registrations";

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
export {
  registerPlanDependent,
  resetPlanDependents,
  blockingPlanDependents,
  type PlanDependent,
} from "./server/plan-dependents";
export { registerPlanDirectory, type PlanInfo } from "./server/plan-directory";
export {
  registerCohortDependent,
  registerGroupDependent,
  resetCohortDependents,
  type CohortDependent,
  type GroupDependent,
} from "./server/cohort-dependents";
export { cohortsTable } from "./server/cohort.table";
export { groupsTable } from "./server/group.table";
export { CohortForm } from "./ui/cohort-form";
export { CohortActions } from "./ui/cohort-actions";
export { GroupManager } from "./ui/group-manager";
export { StartOfYearForm } from "./ui/start-of-year-form";
export {
  getCohort,
  listCohortGroups,
  listProgramOptionsForCohorts,
  type CohortRecord,
} from "./server/cohort.queries";
export { previewStartOfYear } from "./server/group.service";
export { getPlanDirectory } from "./server/plan-directory";
