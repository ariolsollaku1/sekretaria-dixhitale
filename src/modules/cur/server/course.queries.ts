import "server-only";
import { grantScopes } from "@/lib/authz/guard";
import { db } from "@/lib/db";

export async function getCourse(id: string) {
  return db.course.findUnique({
    where: { id },
    include: {
      category: true,
      department: { select: { id: true, code: true, name: true, active: true } },
    },
  });
}

export async function listCategories(onlyActive = false) {
  return db.courseCategory.findMany({
    where: onlyActive ? { active: true } : undefined,
    orderBy: { code: "asc" },
  });
}

/** Departments where this user holds cur.course.write (institution, faculty or department scope). */
export async function writableDepartments(user: {
  id: string;
}): Promise<{ id: string; label: string }[]> {
  const scopes = await grantScopes(user, "cur.course.write");
  if (!scopes.institution && scopes.facultyIds.length === 0 && scopes.departmentIds.length === 0)
    return [];
  const rows = await db.department.findMany({
    where: {
      active: true,
      faculty: { active: true },
      ...(scopes.institution
        ? {}
        : { OR: [{ id: { in: scopes.departmentIds } }, { facultyId: { in: scopes.facultyIds } }] }),
    },
    orderBy: [{ faculty: { code: "asc" } }, { code: "asc" }],
    select: { id: true, code: true, name: true, faculty: { select: { code: true } } },
  });
  return rows.map((d) => ({ id: d.id, label: `${d.faculty.code} / ${d.code} — ${d.name}` }));
}
