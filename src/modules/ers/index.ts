// Public surface of the ERS module: other code imports only from here.
import "./permissions";
export { erasmusApplicationsTable } from "./server/applications.table";
export { knownApplicants, type KnownApplicant } from "./server/applicant-link";
export { ERASMUS_FORMS } from "./domain/erasmus-forms";
export { ERASMUS_FORM_KEYS, applicantKind } from "./domain/rules";
