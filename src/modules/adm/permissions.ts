import { registerPermissions } from "@/lib/authz/registry";

// ADM-06 (AC-6), roles.md "ADM — admissions": the offices that run registration write notices.
// Readers need nothing for them: a notice is an announcement, read with `ntf.announcement.read`.
// ADM-01 (AC-9, SRC-031): the Secretariat and Student Affairs work leads; Finance and the sysadmin
// read them. Leads have no program yet, so there is no scope narrowing.
registerPermissions("adm", {
  permissions: ["adm.notice.write", "adm.lead.read", "adm.lead.write"],
  grants: {
    sysadmin: ["adm.notice.write", "adm.lead.read"],
    secretary: ["adm.notice.write", "adm.lead.read", "adm.lead.write"],
    student_affairs: ["adm.notice.write", "adm.lead.read", "adm.lead.write"],
    administration: ["adm.notice.write"],
    finance: ["adm.lead.read"],
  },
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

// ADM-04 (AC-1), roles.md "ADM — admissions": only the Secretariat and Student Affairs give the
// final approval that turns an application into a student.
registerPermissions("adm", {
  permissions: ["adm.application.enroll"],
  grants: {
    secretary: ["adm.application.enroll"],
    student_affairs: ["adm.application.enroll"],
  },
});
