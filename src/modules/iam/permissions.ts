import { registerPermissions } from "@/lib/authz/registry";

// IAM-02 (Q-127, Q-129, AC-12): who creates student and staff accounts and sees the never-activated
// report. User administration itself (`iam.user.*`) stays a platform permission of the sysadmin.
registerPermissions("iam", {
  permissions: ["iam.account.student", "iam.account.staff", "iam.account.read"],
  grants: {
    sysadmin: ["iam.account.student", "iam.account.staff", "iam.account.read"],
    secretary: ["iam.account.student", "iam.account.read"],
    student_affairs: ["iam.account.student", "iam.account.read"],
    hr: ["iam.account.staff", "iam.account.read"],
  },
});
