import { registerPermissions } from "@/lib/authz/registry";

// AC-11 (FIN-01), roles.md "FIN — finance": Finance writes, the Secretariat and student affairs read.
// FIN-02 AC-12 (SRC-087): payments are visible to Finance and the Secretariat at the same time;
// students see only their own (`fin.payment.self`). Scholarships (FIN-03 AC-8) follow the same split.
registerPermissions("fin", {
  permissions: [
    "fin.fee.read",
    "fin.fee.write",
    "fin.plan.read",
    "fin.plan.write",
    "fin.payment.read",
    "fin.payment.write",
    "fin.payment.self",
    "fin.scholarship.read",
    "fin.scholarship.write",
  ],
  grants: {
    finance: [
      "fin.fee.read",
      "fin.fee.write",
      "fin.plan.read",
      "fin.plan.write",
      "fin.payment.read",
      "fin.payment.write",
      "fin.scholarship.read",
      "fin.scholarship.write",
    ],
    secretary: ["fin.fee.read", "fin.plan.read", "fin.payment.read", "fin.scholarship.read"],
    student_affairs: ["fin.fee.read", "fin.plan.read", "fin.payment.read", "fin.scholarship.read"],
    student: ["fin.payment.self"],
  },
});
