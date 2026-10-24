import "server-only";
import { registerTargetResolver } from "@/lib/authz/registry";
import { db } from "@/lib/db";

// HR-04 AC-11: a staff member is "in" their department (and, through the scope resolvers, its
// faculty), so a head of department's DEPARTMENT-scoped grants apply to exactly their lecturers.
registerTargetResolver("staff", async (id) => {
  const staff = await db.staff.findUnique({
    where: { id },
    select: { departmentId: true, department: { select: { facultyId: true } } },
  });
  if (!staff) return null;
  return {
    ...(staff.departmentId ? { departmentId: staff.departmentId } : {}),
    ...(staff.department ? { facultyId: staff.department.facultyId } : {}),
  };
});
