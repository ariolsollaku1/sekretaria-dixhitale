import "server-only";
import { registerScopeResolver } from "@/lib/authz/registry";
import { db } from "@/lib/db";

// AC-7: PLT-05 scope resolvers. Only active units can be newly assigned; the role editor of IAM-01
// builds its pickers from `options`.
registerScopeResolver("FACULTY", {
  exists: async (id) =>
    !!(await db.faculty.findFirst({ where: { id, active: true }, select: { id: true } })),
  options: async () => {
    const rows = await db.faculty.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    });
    return rows.map((f) => ({ id: f.id, label: `${f.code} — ${f.name}` }));
  },
  ancestors: async () => ({}),
});

registerScopeResolver("DEPARTMENT", {
  exists: async (id) =>
    !!(await db.department.findFirst({ where: { id, active: true }, select: { id: true } })),
  options: async () => {
    const rows = await db.department.findMany({
      where: { active: true, faculty: { active: true } },
      orderBy: [{ faculty: { code: "asc" } }, { code: "asc" }],
      select: { id: true, code: true, name: true, faculty: { select: { code: true } } },
    });
    return rows.map((d) => ({ id: d.id, label: `${d.faculty.code} / ${d.code} — ${d.name}` }));
  },
  ancestors: async (id) => {
    const d = await db.department.findUnique({ where: { id }, select: { facultyId: true } });
    return d ? { facultyId: d.facultyId } : {};
  },
});

// ORG-03 AC-8: program scope. A program's ancestors let faculty- and department-scoped roles
// contain it (target.programId -> departmentId/facultyId in PLT-05's expandTargetScope).
registerScopeResolver("PROGRAM", {
  exists: async (id) =>
    !!(await db.studyProgram.findFirst({ where: { id, active: true }, select: { id: true } })),
  options: async () => {
    const rows = await db.studyProgram.findMany({
      where: { active: true, department: { active: true, faculty: { active: true } } },
      orderBy: [
        { department: { faculty: { code: "asc" } } },
        { department: { code: "asc" } },
        { code: "asc" },
      ],
      select: {
        id: true,
        code: true,
        name: true,
        department: { select: { code: true, faculty: { select: { code: true } } } },
      },
    });
    return rows.map((p) => ({
      id: p.id,
      label: `${p.department.faculty.code} / ${p.department.code} / ${p.code} — ${p.name}`,
    }));
  },
  ancestors: async (id) => {
    const p = await db.studyProgram.findUnique({
      where: { id },
      select: { department: { select: { id: true, facultyId: true } } },
    });
    return p ? { departmentId: p.department.id, facultyId: p.department.facultyId } : {};
  },
});
