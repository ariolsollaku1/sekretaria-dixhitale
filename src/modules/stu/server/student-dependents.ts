import "server-only";
import { db } from "@/lib/db";
import { registerCohortDependent, registerGroupDependent } from "@/modules/org";

// AC-12: students block the ORG-04 changes that would cut the ground from under them.
registerCohortDependent({
  id: "stu.enrollments",
  labelKey: "stu.dependents.enrollments",
  countActive: (cohortId) =>
    db.enrollment.count({ where: { cohortId, status: { in: ["ACTIVE", "SUSPENDED"] } } }),
});

registerGroupDependent({
  id: "stu.yearRegistrations",
  labelKey: "stu.dependents.yearRegistrations",
  countActive: (groupId) => db.yearRegistration.count({ where: { groupId } }),
});
