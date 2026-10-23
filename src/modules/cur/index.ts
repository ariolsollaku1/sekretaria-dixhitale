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
export {
  registerPlanDependent,
  blockingPlanDependents,
  type PlanDependent,
} from "./server/plan-dependents";
