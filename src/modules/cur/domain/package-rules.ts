// CUR-06: pure rules for the curriculum-and-syllabi package (SRC-055). No I/O.

export const PACKAGE_TYPE = "cur.study-package";
export const PACKAGE_PREFIX = "PLN";
export const PACKAGE_SUBJECT = "Enrollment";

/** Q-114 (AC-8): a student may issue at most this many packages per window. */
export const SELF_LIMIT = { limit: 3, windowMs: 60 * 60 * 1000 } as const;
export const selfLimitReached = (issuedInWindow: number): boolean =>
  issuedInWindow >= SELF_LIMIT.limit;

export type SyllabusCandidate = {
  id: string;
  fileId: string;
  academicYearId: string;
  /** ISO start date of the academic year, used to find the most recent. */
  yearStart: string;
};

/**
 * Q-115 (AC-3): among the *approved* syllabi of one plan course, the one of the preferred academic
 * year (the year the student was registered for that course's year of study); otherwise the most
 * recent year. Callers pass approved candidates only.
 */
export function pickSyllabus<T extends SyllabusCandidate>(
  candidates: readonly T[],
  preferredYearId: string | null,
): T | null {
  if (candidates.length === 0) return null;
  const preferred = preferredYearId
    ? candidates.find((c) => c.academicYearId === preferredYearId)
    : undefined;
  if (preferred) return preferred;
  return [...candidates].sort((a, b) => b.yearStart.localeCompare(a.yearStart))[0]!;
}

export type PackageCourse = {
  planCourseId: string;
  yearOfStudy: number;
  semester: number;
  code: string;
  name: string;
  credits: number;
  hoursLecture: number;
  hoursSeminar: number;
  hoursLab: number;
  isElective: boolean;
  /** Whether a readable approved syllabus goes into the package. */
  hasSyllabus: boolean;
};

export type SemesterGroup = {
  yearOfStudy: number;
  semester: number;
  credits: number;
  courses: {
    code: string;
    name: string;
    credits: number;
    hours: string;
    elective: boolean;
    hasSyllabus: boolean;
    noSyllabus: boolean;
  }[];
};

/** Courses grouped by year of study and semester, in order, with the credits of each group. */
export function groupSemesters(courses: readonly PackageCourse[]): SemesterGroup[] {
  const sorted = [...courses].sort(
    (a, b) =>
      a.yearOfStudy - b.yearOfStudy || a.semester - b.semester || a.code.localeCompare(b.code),
  );
  const groups: SemesterGroup[] = [];
  for (const c of sorted) {
    let g = groups.at(-1);
    if (!g || g.yearOfStudy !== c.yearOfStudy || g.semester !== c.semester) {
      g = { yearOfStudy: c.yearOfStudy, semester: c.semester, credits: 0, courses: [] };
      groups.push(g);
    }
    g.credits += c.credits;
    g.courses.push({
      code: c.code,
      name: c.name,
      credits: c.credits,
      hours: `${c.hoursLecture}/${c.hoursSeminar}/${c.hoursLab}`,
      elective: c.isElective,
      hasSyllabus: c.hasSyllabus,
      noSyllabus: !c.hasSyllabus,
    });
  }
  return groups;
}

export type PackageCounts = { courses: number; included: number; missing: number; credits: number };

export function packageCounts(courses: readonly PackageCourse[]): PackageCounts {
  const included = courses.filter((c) => c.hasSyllabus).length;
  return {
    courses: courses.length,
    included,
    missing: courses.length - included,
    credits: courses.reduce((sum, c) => sum + c.credits, 0),
  };
}

export type TemplateInput = {
  program: { code: string; name: string; cycle: string };
  student: { name: string; number: string };
  cohort: string;
  planVersion: number;
  planFrom: string;
  courses: readonly PackageCourse[];
};

/** Q-117 (AC-2): the variables the template receives; `number`, `issuedDate`, `qr` come from PLT-09. */
export function templateData(input: TemplateInput): Record<string, unknown> {
  const counts = packageCounts(input.courses);
  return {
    program: input.program,
    student: input.student,
    cohort: input.cohort,
    planVersion: input.planVersion,
    planFrom: input.planFrom,
    semesters: groupSemesters(input.courses).map((g) => ({
      ...g,
      label: `${g.yearOfStudy}.${g.semester}`,
    })),
    totalCredits: counts.credits,
    courseCount: counts.courses,
    syllabusCount: counts.included,
    missingCount: counts.missing,
    hasMissing: counts.missing > 0,
  };
}

/** Sample data for the template preview in the document admin pages. */
export const SAMPLE_DATA: Record<string, unknown> = templateData({
  program: { code: "INF", name: "Informatikë", cycle: "FIRST" },
  student: { name: "Emër Mbiemër", number: "000001" },
  cohort: "2024-2025",
  planVersion: 1,
  planFrom: "2024-2025",
  courses: [
    {
      planCourseId: "a",
      yearOfStudy: 1,
      semester: 1,
      code: "INF101",
      name: "Hyrje në programim",
      credits: 6,
      hoursLecture: 30,
      hoursSeminar: 15,
      hoursLab: 0,
      isElective: false,
      hasSyllabus: true,
    },
    {
      planCourseId: "b",
      yearOfStudy: 1,
      semester: 2,
      code: "INF102",
      name: "Algoritma",
      credits: 6,
      hoursLecture: 30,
      hoursSeminar: 15,
      hoursLab: 0,
      isElective: true,
      hasSyllabus: false,
    },
  ],
});
