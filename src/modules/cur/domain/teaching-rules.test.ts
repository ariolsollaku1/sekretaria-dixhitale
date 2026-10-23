import { describe, expect, it } from "vitest";
import { assignmentSchema } from "./teaching-schemas";
import {
  defaultHours,
  lecturerLoads,
  overloaded,
  planCopy,
  resolveMaxPlannedHours,
  unassignedCourses,
  validateAssignment,
  type AssignmentContext,
  type CopySource,
  type CopyTarget,
} from "./teaching-rules";

describe("defaultHours (AC-3)", () => {
  it("takes the plan course's hours for the kind", () => {
    const pc = { hoursLecture: 30, hoursSeminar: 15, hoursLab: 10 };
    expect([
      defaultHours(pc, "LECTURE"),
      defaultHours(pc, "SEMINAR"),
      defaultHours(pc, "LAB"),
    ]).toEqual([30, 15, 10]);
  });
});

describe("validateAssignment (AC-2)", () => {
  const ok: AssignmentContext = {
    group: { active: true, yearOfStudy: 2, cohortPlanId: "plan", yearStatus: "CURRENT" },
    planCourse: { planId: "plan", yearOfStudy: 2 },
    staff: { active: true, kind: "ACADEMIC" },
  };
  it("accepts a consistent assignment", () => expect(validateAssignment(ok)).toEqual({}));
  it.each([
    [{ group: { ...ok.group, active: false } }, "groupId", "groupInactive"],
    [{ group: { ...ok.group, yearStatus: "CLOSED" as const } }, "groupId", "yearClosed"],
    [{ planCourse: { planId: "other", yearOfStudy: 2 } }, "planCourseId", "courseNotInGroup"],
    [{ planCourse: { planId: "plan", yearOfStudy: 1 } }, "planCourseId", "courseNotInGroup"],
    [{ staff: { active: false, kind: "ACADEMIC" as const } }, "staffId", "staffInactive"],
    [{ staff: { active: true, kind: "ADMINISTRATIVE" as const } }, "staffId", "staffNotAcademic"],
  ])("refuses %j", (patch, field, code) => {
    expect(validateAssignment({ ...ok, ...patch })).toMatchObject({ [field]: code });
  });
});

describe("loads and warnings (AC-6)", () => {
  it("sums planned hours per lecturer and flags those above the limit", () => {
    const loads = lecturerLoads([
      { staffId: "a", plannedHours: 200 },
      { staffId: "a", plannedHours: 150 },
      { staffId: "b", plannedHours: 100 },
    ]);
    expect(overloaded(loads, 300)).toEqual([{ staffId: "a", hours: 350 }]);
    expect(overloaded(loads, 350)).toEqual([]);
    expect(overloaded(loads, null)).toEqual([]);
  });
  it("reads the limit setting; unusable values mean off", () => {
    expect(resolveMaxPlannedHours(400)).toBe(400);
    for (const bad of [undefined, null, 0, -1, 2.5, "400"])
      expect(resolveMaxPlannedHours(bad)).toBeNull();
  });
  it("lists the group × course pairs without any assignment", () => {
    const pairs = [
      { groupId: "g1", planCourseId: "c1" },
      { groupId: "g1", planCourseId: "c2" },
      { groupId: "g2", planCourseId: "c1" },
    ];
    expect(unassignedCourses(pairs, [{ groupId: "g1", planCourseId: "c1" }])).toEqual([
      { groupId: "g1", planCourseId: "c2" },
      { groupId: "g2", planCourseId: "c1" },
    ]);
  });
});

describe("planCopy (AC-5)", () => {
  const src = (over: Partial<CopySource> = {}): CopySource => ({
    programId: "p",
    yearOfStudy: 1,
    groupName: "G1",
    courseId: "course-a",
    kind: "LECTURE",
    staffId: "s1",
    staffActive: true,
    plannedHours: 30,
    ...over,
  });
  const target = (over: Partial<CopyTarget> = {}): CopyTarget => ({
    groupId: "t1",
    programId: "p",
    yearOfStudy: 1,
    groupName: "G1",
    planCourses: [{ id: "pc-a", courseId: "course-a", semester: 1 }],
    existing: new Set(),
    ...over,
  });
  it("copies by program, year of study, group name, course, kind and lecturer", () => {
    const r = planCopy([src(), src({ kind: "LAB", plannedHours: 15 })], [target()]);
    expect(r.rows).toEqual([
      {
        groupId: "t1",
        planCourseId: "pc-a",
        staffId: "s1",
        kind: "LECTURE",
        semester: 1,
        plannedHours: 30,
      },
      {
        groupId: "t1",
        planCourseId: "pc-a",
        staffId: "s1",
        kind: "LAB",
        semester: 1,
        plannedHours: 15,
      },
    ]);
  });
  it("skips other groups, courses missing from the target plan, existing rows and inactive lecturers", () => {
    const r = planCopy(
      [
        src({ groupName: "G2" }),
        src({ yearOfStudy: 2 }),
        src({ programId: "q" }),
        src({ courseId: "course-b" }),
        src({ staffActive: false }),
        src({ staffId: "s2" }),
      ],
      [target({ existing: new Set(["pc-a:LECTURE:s2"]) })],
    );
    expect(r.rows).toEqual([]);
    expect(r.skippedInactive).toBe(1);
    expect(r.skippedExisting).toBe(1);
  });
});

describe("assignmentSchema (AC-1)", () => {
  const base = { groupId: "g", planCourseId: "p", staffId: "s", kind: "LECTURE" };
  it("leaves hours optional", () =>
    expect(assignmentSchema.parse(base).plannedHours).toBeUndefined());
  it.each([
    { kind: "EXAM" },
    { plannedHours: 501 },
    { plannedHours: -1 },
    { plannedHours: 2.5 },
    { staffId: "" },
  ])("refuses %j", (patch) =>
    expect(assignmentSchema.safeParse({ ...base, ...patch }).success).toBe(false),
  );
});
