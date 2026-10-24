import { registerPermissions } from "@/lib/authz/registry";

// AC-6 (ADM-06), roles.md "ADM — admissions": the offices that run registration write notices.
// Readers need nothing here: a notice is an announcement, read with `ntf.announcement.read`.
const WRITERS = ["sysadmin", "secretary", "student_affairs", "administration"] as const;

registerPermissions("adm", {
  permissions: ["adm.notice.write"],
  grants: Object.fromEntries(WRITERS.map((r) => [r, ["adm.notice.write"]])),
});

// AC-12 (ADM-02), roles.md "ADM — admissions": Secretariat and Student Affairs write, Finance and
// the sysadmin read. Candidates have no account (Q-19) and use the token routes instead;
// `adm.application.upload` is held by nobody (it only gives the file purpose an upload permission,
// so /api/files cannot be used to upload application documents).
registerPermissions("adm", {
  permissions: [
    "adm.application.read",
    "adm.application.upload",
    "adm.cycle.read",
    "adm.cycle.write",
  ],
  grants: {
    sysadmin: ["adm.application.read", "adm.cycle.read"],
    secretary: ["adm.application.read", "adm.cycle.read", "adm.cycle.write"],
    student_affairs: ["adm.application.read", "adm.cycle.read", "adm.cycle.write"],
    finance: ["adm.application.read", "adm.cycle.read"],
  },
});
