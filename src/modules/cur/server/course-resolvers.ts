import "server-only";
import { registerTargetResolver } from "@/lib/authz/registry";
import { db } from "@/lib/db";

// A course is "in" its owning department (and, through the scope resolvers, its faculty), so a head
// of department's DEPARTMENT-scoped write permission applies to exactly their courses (CUR-01 AC-3).
registerTargetResolver("course", async (id) => {
  const course = await db.course.findUnique({ where: { id }, select: { departmentId: true } });
  return course ? { departmentId: course.departmentId } : null;
});
