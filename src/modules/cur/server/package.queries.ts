import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { grantScopes } from "@/lib/authz/guard";
import { db, type Tx } from "@/lib/db";
import {
  PACKAGE_SUBJECT,
  PACKAGE_TYPE,
  packageCounts,
  pickSyllabus,
  type PackageCounts,
  type PackageCourse,
} from "../domain/package-rules";

type Client = Pick<Tx, "enrollment" | "planCourse" | "syllabus">;

export type CollectedCourse = PackageCourse & {
  /** The stored file of the chosen approved syllabus, if any. */
  syllabusFileId: string | null;
};

export type Collected = {
  enrollmentId: string;
  programId: string;
  program: { code: string; name: string; cycle: string };
  student: { id: string; personId: string; name: string; number: string };
  cohort: string;
  plan: { id: string; version: number; status: "DRAFT" | "APPROVED" | "ARCHIVED"; from: string };
  courses: CollectedCourse[];
};

/** AC-2/AC-3: the plan of the enrollment's cohort with the chosen approved syllabus per course. */
export async function collect(client: Client, enrollmentId: string): Promise<Collected | null> {
  const e = await client.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      student: { select: { id: true, personId: true, studentNumber: true, person: true } },
      program: { select: { id: true, code: true, name: true, cycle: true } },
      cohort: {
        select: {
          name: true,
          plan: {
            select: {
              id: true,
              version: true,
              status: true,
              validFrom: { select: { code: true } },
            },
          },
        },
      },
      years: { select: { academicYearId: true, yearOfStudy: true } },
    },
  });
  if (!e) return null;
  const planCourses = await client.planCourse.findMany({
    where: { planId: e.cohort.plan.id },
    include: { course: { select: { code: true, name: true } } },
  });
  // approved syllabi of the same course in the same program, whichever plan carries them (as the
  // carry-forward of CUR-03 does), so a new plan version can use the syllabi of the old one
  const syllabi = await client.syllabus.findMany({
    where: {
      status: "APPROVED",
      planCourse: {
        courseId: { in: planCourses.map((p) => p.courseId) },
        plan: { programId: e.programId },
      },
    },
    select: {
      id: true,
      fileId: true,
      academicYearId: true,
      academicYear: { select: { startDate: true } },
      planCourse: { select: { courseId: true } },
    },
  });
  const byCourse = new Map<string, typeof syllabi>();
  for (const s of syllabi) {
    const list = byCourse.get(s.planCourse.courseId) ?? [];
    list.push(s);
    byCourse.set(s.planCourse.courseId, list);
  }
  const courses: CollectedCourse[] = planCourses.map((pc) => {
    const registered = e.years.find((y) => y.yearOfStudy === pc.yearOfStudy);
    const chosen = pickSyllabus(
      (byCourse.get(pc.courseId) ?? []).map((s) => ({
        id: s.id,
        fileId: s.fileId,
        academicYearId: s.academicYearId,
        yearStart: s.academicYear.startDate.toISOString().slice(0, 10),
      })),
      registered?.academicYearId ?? null,
    );
    return {
      planCourseId: pc.id,
      yearOfStudy: pc.yearOfStudy,
      semester: pc.semester,
      code: pc.course.code,
      name: pc.course.name,
      credits: pc.credits,
      hoursLecture: pc.hoursLecture,
      hoursSeminar: pc.hoursSeminar,
      hoursLab: pc.hoursLab,
      isElective: pc.isElective,
      hasSyllabus: chosen !== null,
      syllabusFileId: chosen?.fileId ?? null,
    };
  });
  return {
    enrollmentId: e.id,
    programId: e.programId,
    program: { code: e.program.code, name: e.program.name, cycle: e.program.cycle },
    student: {
      id: e.student.id,
      personId: e.student.personId,
      name: `${e.student.person.firstName} ${e.student.person.lastName}`,
      number: e.student.studentNumber,
    },
    cohort: e.cohort.name,
    plan: {
      id: e.cohort.plan.id,
      version: e.cohort.plan.version,
      status: e.cohort.plan.status,
      from: e.cohort.plan.validFrom.code,
    },
    courses,
  };
}

export type EnrollmentPreview = {
  enrollmentId: string;
  programCode: string;
  programName: string;
  cohort: string;
  status: string;
  planApproved: boolean;
  counts: PackageCounts;
};

const previewOf = (c: Collected, status: string): EnrollmentPreview => ({
  enrollmentId: c.enrollmentId,
  programCode: c.program.code,
  programName: c.program.name,
  cohort: c.cohort,
  status,
  planApproved: c.plan.status === "APPROVED",
  counts: packageCounts(c.courses),
});

export type IssuedPackage = {
  id: string;
  number: string;
  fileId: string;
  issuedAt: Date;
  cancelled: boolean;
  language: string;
  student: string;
  program: string;
};

type EnrollmentRow = {
  id: string;
  program: { code: string };
  student: { studentNumber: string; person: { firstName: string; lastName: string } };
};

async function issuedFor(
  enrollments: EnrollmentRow[],
  limit: number,
  docsWhere: Prisma.IssuedDocumentWhereInput,
): Promise<IssuedPackage[]> {
  if (enrollments.length === 0) return [];
  const byId = new Map(enrollments.map((e) => [e.id, e]));
  const docs = await db.issuedDocument.findMany({
    where: {
      type: PACKAGE_TYPE,
      subjectType: PACKAGE_SUBJECT,
      subjectId: { in: [...byId.keys()] },
      ...docsWhere,
    },
    orderBy: { issuedAt: "desc" },
    take: limit,
  });
  return docs.map((d) => {
    const e = byId.get(d.subjectId!)!;
    return {
      id: d.id,
      number: d.number,
      fileId: d.fileId,
      issuedAt: d.issuedAt,
      cancelled: d.cancelledAt !== null,
      language: d.language,
      student: `${e.student.person.firstName} ${e.student.person.lastName} (${e.student.studentNumber})`,
      program: e.program.code,
    };
  });
}

const enrollmentSelect = {
  id: true,
  status: true,
  program: { select: { code: true } },
  student: { select: { studentNumber: true, person: true } },
} satisfies Prisma.EnrollmentSelect;

/** AC-7: enrollments in the programs of the user's `cur.package.issue` grants. */
export async function scopeWhere(user: { id: string }): Promise<Prisma.EnrollmentWhereInput> {
  const g = await grantScopes(user, "cur.package.issue");
  if (g.institution) return {};
  return {
    program: {
      OR: [
        { id: { in: g.programIds } },
        { departmentId: { in: g.departmentIds } },
        { department: { facultyId: { in: g.facultyIds } } },
      ],
    },
  };
}

export type StaffStudent = {
  studentId: string;
  name: string;
  number: string;
  enrollments: EnrollmentPreview[];
};

/** AC-11: students (within scope) matching a number or name, each enrollment with its preview. */
export async function searchStudents(user: { id: string }, q: string): Promise<StaffStudent[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const rows = await db.enrollment.findMany({
    where: {
      AND: [
        await scopeWhere(user),
        {
          student: {
            OR: [
              { studentNumber: { startsWith: term } },
              { person: { lastName: { contains: term, mode: "insensitive" } } },
              { person: { firstName: { contains: term, mode: "insensitive" } } },
            ],
          },
        },
      ],
    },
    orderBy: [{ student: { person: { lastName: "asc" } } }, { startedAt: "desc" }],
    select: { id: true, status: true, studentId: true },
    take: 40,
  });
  const students = new Map<string, StaffStudent>();
  for (const r of rows) {
    const c = await collect(db, r.id);
    if (!c) continue;
    const s = students.get(r.studentId) ?? {
      studentId: r.studentId,
      name: c.student.name,
      number: c.student.number,
      enrollments: [],
    };
    s.enrollments.push(previewOf(c, r.status));
    students.set(r.studentId, s);
  }
  return [...students.values()].slice(0, 10);
}

/** AC-11: the most recent packages within the user's scope. */
export async function recentIssued(user: { id: string }, limit = 30): Promise<IssuedPackage[]> {
  const recent = await db.issuedDocument.findMany({
    where: { type: PACKAGE_TYPE, subjectType: PACKAGE_SUBJECT },
    orderBy: { issuedAt: "desc" },
    take: 200,
    select: { subjectId: true },
  });
  const ids = [...new Set(recent.map((d) => d.subjectId!))];
  const enrollments = await db.enrollment.findMany({
    where: { AND: [{ id: { in: ids } }, await scopeWhere(user)] },
    select: enrollmentSelect,
  });
  return issuedFor(enrollments, limit, {});
}

export type OwnPackages = {
  enrollments: EnrollmentPreview[];
  issued: IssuedPackage[];
};

/** AC-7/AC-11: only the signed-in student's own enrollments and packages; null without a student. */
export async function ownPackages(user: { id: string }): Promise<OwnPackages | null> {
  const u = await db.user.findUnique({ where: { id: user.id }, select: { personId: true } });
  if (!u?.personId) return null;
  const student = await db.student.findUnique({
    where: { personId: u.personId },
    select: { id: true },
  });
  if (!student) return null;
  const rows = await db.enrollment.findMany({
    where: { studentId: student.id },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    select: enrollmentSelect,
  });
  const enrollments: EnrollmentPreview[] = [];
  for (const r of rows) {
    const c = await collect(db, r.id);
    if (c) enrollments.push(previewOf(c, r.status));
  }
  return { enrollments, issued: await issuedFor(rows, 30, {}) };
}
