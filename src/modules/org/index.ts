// Public surface of the ORG module: other code imports only from here.
import "./permissions";
import "./server/year.provider";
import "./server/scope-resolvers";

export { YearForm } from "./ui/year-form";
export { MakeCurrentButton } from "./ui/make-current-button";
export { yearsTable } from "./server/year.table";
export {
  getYear,
  getCurrentAcademicYear,
  isYearWritable,
  assertYearWritable,
  YearClosedError,
  type YearView,
} from "./server/year.queries";
export {
  registerYearChecklistItem,
  allChecklistItems,
  visibleChecklist,
  type ChecklistItem,
} from "./server/rollover";
