import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";
import { ageOn, birthRangeForAges } from "../domain/age";
import { CATEGORIES } from "../domain/schemas";
import { today } from "./contract.queries";
import { scopeWhere } from "./staff.queries";

type Row = {
  id: string;
  /** NTF-03: the person to message (never shown). */
  personId: string;
  name: string;
  category: string;
  faculty: string;
  department: string;
  degree: string;
  title: string;
  gender: string;
  age: number;
  primaryEmployer: string;
  retired: boolean;
  active: boolean;
};

const intOrNull = (v: string | undefined) => (v && /^\d{1,3}$/.test(v) ? Number(v) : null);
const yes = (b: boolean) => (b ? "hr.yes" : "hr.no");

/**
 * HR-05 AC-1..AC-4: the standard lecturer lists as one filterable table. Age is derived; birth
 * date, national ID and address are never columns.
 */
export const lecturersTable = registerTable(
  defineTable<Row>({
    id: "hr.lecturers",
    permission: "hr.staff.read",
    exportName: "lecturers",
    rowKey: (r) => r.id,
    recipient: (r) => r.personId,
    columns: [
      {
        key: "name",
        labelKey: "hr.columns.name",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "category", labelKey: "hr.columns.category", type: "text", sortable: true },
      { key: "faculty", labelKey: "hr.lists.faculty", type: "text" },
      { key: "department", labelKey: "hr.columns.department", type: "text" },
      { key: "degree", labelKey: "hr.columns.degree", type: "text" },
      { key: "title", labelKey: "hr.columns.title", type: "text" },
      { key: "gender", labelKey: "hr.form.gender", type: "text" },
      { key: "age", labelKey: "hr.lists.age", type: "number" },
      {
        key: "primaryEmployer",
        labelKey: "hr.form.primaryEmployer",
        type: "text",
        defaultVisible: false,
      },
      { key: "retired", labelKey: "hr.columns.retired", type: "text", defaultVisible: false },
      { key: "active", labelKey: "hr.lists.employed", type: "text", defaultVisible: false },
    ],
    filters: [
      {
        key: "category",
        labelKey: "hr.columns.category",
        type: "select",
        options: CATEGORIES.map((v) => ({ value: v, labelKey: `hr.category.${v}` })),
      },
      { key: "faculty", labelKey: "hr.lists.facultyCode", type: "text" },
      { key: "department", labelKey: "hr.columns.departmentCode", type: "text" },
      { key: "program", labelKey: "hr.lists.programCode", type: "text" },
      {
        key: "semester",
        labelKey: "hr.lists.semester",
        type: "select",
        options: [1, 2].map((n) => ({ value: String(n), labelKey: `cur.teaching.semesterN.${n}` })),
      },
      {
        key: "retired",
        labelKey: "hr.columns.retired",
        type: "select",
        options: [
          { value: "yes", labelKey: "hr.yes" },
          { value: "no", labelKey: "hr.no" },
        ],
      },
      {
        key: "gender",
        labelKey: "hr.form.gender",
        type: "select",
        options: [
          { value: "FEMALE", labelKey: "hr.gender.FEMALE" },
          { value: "MALE", labelKey: "hr.gender.MALE" },
        ],
      },
      { key: "title", labelKey: "hr.columns.title", type: "text" },
      { key: "degree", labelKey: "hr.columns.degree", type: "text" },
      { key: "ageFrom", labelKey: "hr.lists.ageFrom", type: "text" },
      { key: "ageTo", labelKey: "hr.lists.ageTo", type: "text" },
      {
        key: "status",
        labelKey: "hr.lists.employed",
        type: "select",
        options: [
          { value: "active", labelKey: "hr.status.active" },
          { value: "inactive", labelKey: "hr.status.inactive" },
        ],
      },
    ],
    defaultSort: { key: "name", dir: "asc" },
    values: {
      name: (r) => r.name,
      category: (r, { t }) => t(`hr.category.${r.category}`),
      faculty: (r) => r.faculty,
      department: (r) => r.department,
      degree: (r) => r.degree,
      title: (r) => r.title,
      gender: (r, { t }) => t(`hr.gender.${r.gender}`),
      age: (r) => r.age,
      primaryEmployer: (r) => r.primaryEmployer,
      retired: (r, { t }) => t(yes(r.retired)),
      active: (r, { t }) => t(r.active ? "hr.status.active" : "hr.status.inactive"),
    },
    cells: {
      name: (r) => (
        <Link href={`/hr/staff/${r.id}`} className="underline">
          {r.name}
        </Link>
      ),
    },
    async fetch(params, { user }) {
      const f = params.filters;
      const day = today();
      const and: Prisma.StaffWhereInput[] = [await scopeWhere(user), { kind: "ACADEMIC" }];
      if (f.category) and.push({ category: f.category as never });
      if (f.faculty)
        and.push({ department: { faculty: { code: { contains: f.faculty.toUpperCase() } } } });
      if (f.department)
        and.push({ department: { code: { contains: f.department.toUpperCase() } } });
      if (f.retired) and.push({ retired: f.retired === "yes" });
      if (f.gender) and.push({ person: { gender: f.gender as never } });
      if (f.title) and.push({ title: { contains: f.title, mode: "insensitive" } });
      if (f.degree) and.push({ degree: { contains: f.degree, mode: "insensitive" } });
      if (f.status) and.push({ active: f.status === "active" });
      const range = birthRangeForAges(intOrNull(f.ageFrom), intOrNull(f.ageTo), day);
      if (range.gte || range.lte)
        and.push({
          person: {
            birthDate: {
              ...(range.gte ? { gte: new Date(`${range.gte}T00:00:00Z`) } : {}),
              ...(range.lte ? { lte: new Date(`${range.lte}T00:00:00Z`) } : {}),
            },
          },
        });
      // the lecturers who teach in the selected year (CUR-04): by semester and/or program
      if (f.semester || f.program) {
        const yearId = await getSelectedAcademicYear();
        and.push({
          teachingAssignments: {
            some: {
              group: {
                academicYearId: yearId ?? "none",
                ...(f.program
                  ? { cohort: { program: { code: { contains: f.program.toUpperCase() } } } }
                  : {}),
              },
              ...(f.semester ? { semester: Number(f.semester) } : {}),
            },
          },
        });
      }
      const where: Prisma.StaffWhereInput = { AND: and };
      const dir = params.sort.dir;
      const orderBy: Prisma.StaffOrderByWithRelationInput[] =
        params.sort.key === "category"
          ? [{ category: dir }, { person: { lastName: "asc" } }]
          : [{ person: { lastName: dir } }, { person: { firstName: dir } }];
      const [total, rows] = await Promise.all([
        db.staff.count({ where }),
        db.staff.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          include: {
            person: { select: { firstName: true, lastName: true, gender: true, birthDate: true } },
            department: { select: { code: true, faculty: { select: { code: true } } } },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map((s) => ({
          id: s.id,
          personId: s.personId,
          name: `${s.person.lastName} ${s.person.firstName}`,
          category: s.category,
          faculty: s.department?.faculty.code ?? "",
          department: s.department?.code ?? "",
          degree: s.degree ?? "",
          title: s.title ?? "",
          gender: s.person.gender,
          age: ageOn(s.person.birthDate.toISOString().slice(0, 10), day),
          primaryEmployer: s.primaryEmployer ?? "",
          retired: s.retired,
          active: s.active,
        })),
      };
    },
  }),
);
