import "server-only";
import { registerTargetResolver } from "@/lib/authz/registry";
import { db } from "@/lib/db";

// A course is "in" its owning department (and, through the scope resolvers, its faculty), so a head
// of department's DEPARTMENT-scoped write permission applies to exactly their courses (CUR-01 AC-3).
registerTargetResolver("course", async (id) => {
  const course = await db.course.findUnique({ where: { id }, select: { departmentId: true } });
  return course ? { departmentId: course.departmentId } : null;
});

// CUR-02 AC-11: a plan is "in" its program, so a coordinator's PROGRAM scope (or a head's
// DEPARTMENT scope, through the program's ancestors) applies to exactly their plans.
registerTargetResolver("plan", async (id) => {
  const plan = await db.curriculumPlan.findUnique({ where: { id }, select: { programId: true } });
  return plan ? { programId: plan.programId } : null;
});
