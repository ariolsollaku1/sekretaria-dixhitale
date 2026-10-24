# IAM — Users & access

Code: `src/modules/iam`. Roles: [../../01-product/roles.md](../../01-product/roles.md).
Auth design: [../../02-architecture/auth.md](../../02-architecture/auth.md).

### IAM-01 — User & role administration
- **Goal:** sysadmin creates staff users, assigns roles with scopes, deactivates users (SRC-010).
- **Spec:** [../specs/IAM-01-user-admin.md](../specs/IAM-01-user-admin.md)

### IAM-02 — Account provisioning lifecycle
- **Goal:** accounts follow the person's lifecycle automatically.
- **Scope:** student account created on enrollment (ADM-04 / STU-01 action) with role `student`
  scope `SELF`; staff account offered when HR registers a staff member (HR-01); accounts disabled
  when enrollment ends (graduated/deregistered — SRC-037: alumni have no access) or contract ends;
  re-enabled on re-enrollment; bulk "send activation emails" for a cohort; report of accounts never
  activated.
- **Assumption (Q-19):** username = personal email unless the institution issues student emails.
- **Spec:** [../specs/IAM-02-account-provisioning.md](../specs/IAM-02-account-provisioning.md)
- **As built:** accounts are created on request (student page, staff page, whole cohort), not behind
  the secretariat's back (Q-127); access follows open enrollments and active employment (Q-128);
  HR picks the staff role (Q-129); `/admin/accounts` lists accounts never activated (Q-130).
