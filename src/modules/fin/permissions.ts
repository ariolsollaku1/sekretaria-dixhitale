import { registerPermissions } from "@/lib/authz/registry";

// AC-11 (FIN-01), roles.md "FIN — finance": Finance writes, the Secretariat and student affairs read.
// Students get their own view with FIN-02.
registerPermissions("fin", {
  permissions: ["fin.fee.read", "fin.fee.write", "fin.plan.read", "fin.plan.write"],
  grants: {
    finance: ["fin.fee.read", "fin.fee.write", "fin.plan.read", "fin.plan.write"],
    secretary: ["fin.fee.read", "fin.plan.read"],
    student_affairs: ["fin.fee.read", "fin.plan.read"],
  },
});
