// Public surface of the CUR module: other code imports only from here.
import "./permissions";
import "./server/course-resolvers";

export { coursesTable } from "./server/course.table";
export { getCourse, listCategories, writableDepartments } from "./server/course.queries";
export {
  registerCourseDependent,
  blockingCourseDependents,
  type CourseDependent,
} from "./server/course-dependents";
export { CourseForm } from "./ui/course-form";
export { CourseStatusActions } from "./ui/course-status-actions";
export { CourseImport } from "./ui/course-import";
export { CategoryManager } from "./ui/category-manager";
export { TEMPLATE_CSV } from "./domain/import";
import "./server/plan-dependents";

export { plansTable } from "./server/plan.table";
export { PlanCreateForm } from "./ui/plan-create-form";
export { PlanActions } from "./ui/plan-actions";
export { PlanEditor, type EditorRow } from "./ui/plan-editor";
export {
  getPlan,
  listCourseOptions,
  writablePrograms,
  listProgramPlans,
  getCreditsPerSemester,
  type PlanRecord,
} from "./server/plan.queries";
export { planTotals, type PlanTotals, type PlanWarning } from "./domain/plan-rules";
export { teachingTable } from "./server/teaching.table";
export { TeachingBoard } from "./ui/teaching-board";
export { TeachingCopy } from "./ui/teaching-copy";
export { board as teachingBoard, ownAssignments } from "./server/teaching.queries";
export { teachingLoadTable } from "./server/load.table";
export {
  getAssignmentContext,
  listGroupAssignments,
  listStaffAssignments,
  findAssignments,
  type AssignmentContext,
} from "./server/assignment-context";
