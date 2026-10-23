import "server-only";
import { db } from "@/lib/db";

export async function getFaculty(id: string) {
  const faculty = await db.faculty.findUnique({
    where: { id },
    include: {
      departments: {
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true, active: true },
      },
    },
  });
  return faculty;
}

/** AC-9: people who currently hold the head_of_department role scoped to this department. */
export async function getDepartmentHeads(departmentId: string) {
  const now = new Date();
  const rows = await db.userRole.findMany({
    where: {
      role: "head_of_department",
      scopeType: "DEPARTMENT",
      scopeId: departmentId,
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
      user: { active: true },
    },
    select: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => r.user);
}

export async function getDepartment(id: string) {
  const department = await db.department.findUnique({
    where: { id },
    include: { faculty: { select: { id: true, code: true, name: true, active: true } } },
  });
  if (!department) return null;
  return { ...department, heads: await getDepartmentHeads(id) };
}

export async function listFacultyOptions(onlyActive = true) {
  const faculties = await db.faculty.findMany({
    where: onlyActive ? { active: true } : undefined,
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  return faculties.map((f) => ({ id: f.id, label: `${f.code} — ${f.name}` }));
}
