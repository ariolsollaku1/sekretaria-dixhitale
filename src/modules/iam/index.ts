// Public surface of the IAM module: other code imports only from here.
export { UserForm } from "./ui/user-form";
export { UserEditForm } from "./ui/user-edit-form";
export { UserRolesPanel, type AssignmentView } from "./ui/user-roles-panel";
export { UserStatusActions } from "./ui/user-status-actions";
export { getUserDetail, getRoleEditorOptions } from "./server/user.queries";
export { usersTable } from "./server/user.table";
export { splitName } from "./domain/rules";
// IAM-02: account provisioning lifecycle
import "./permissions";
import "./server/account-hooks";
export { AccountPanel } from "./ui/account-panel";
export { CohortAccounts } from "./ui/cohort-accounts";
export { getAccountPanel } from "./server/account.queries";
export { neverActivatedTable } from "./server/account.table";
export { STAFF_ACCOUNT_ROLES, defaultStaffRole } from "./domain/account-rules";
