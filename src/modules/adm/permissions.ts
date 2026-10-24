import { registerPermissions } from "@/lib/authz/registry";

// AC-6 (ADM-06), roles.md "ADM — admissions": the offices that run registration write notices.
// Readers need nothing here: a notice is an announcement, read with `ntf.announcement.read`.
const WRITERS = ["sysadmin", "secretary", "student_affairs", "administration"] as const;

registerPermissions("adm", {
  permissions: ["adm.notice.write"],
  grants: Object.fromEntries(WRITERS.map((r) => [r, ["adm.notice.write"]])),
});
