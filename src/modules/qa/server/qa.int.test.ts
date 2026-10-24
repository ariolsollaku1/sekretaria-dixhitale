import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import "@/modules/org";
import "@/modules/cur";
import "@/modules/hr";
import "../permissions";
import * as campaigns from "./campaign.service";
import { getCampaign } from "./campaign.queries";
import { campaignResults, targetResults } from "./result.queries";
import { ownSurveys, surveyForm } from "./survey.queries";
import * as surveys from "./survey.service";

let actorId = "qual";
function run<R>(fn: (ctx: ActionContext) => Promise<R>): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => ({
      id: actorId,
      email: `${actorId}@t.test`,
      name: actorId,
      locale: null,
      personId: null,
    }),
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "qa.campaign.manage",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};
const code = (r: ActionResult<unknown>) => (r.ok ? "OK" : `${r.error.code}:${r.error.message}`);

const QUESTIONS = [
  { key: "clear", section: "LECTURER", type: "SCALE", label: { sq: "E qartë" } },
  { key: "ready", section: "LECTURER", type: "SCALE", label: { sq: "E përgatitur" } },
  { key: "note", section: "LECTURER", type: "TEXT", label: { sq: "Koment" } },
  { key: "desk", section: "ADMINISTRATION", type: "SCALE", label: { sq: "Sporteli" } },
] as never;

let yearId: string,
  closedYearId: string,
  group1: string,
  group2: string,
  dep1: string,
  dep2: string;
let a1: string, a2: string;
let stu: string[] = []; // user ids of students 1..6 (1..5 in group1, 6 in group2)

async function user(id: string, role: string, personId?: string, scope?: [string, string]) {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id, personId } });
  await db.userRole.create({
    data: {
      userId: id,
      role: role as never,
      scopeType: (scope?.[0] as never) ?? "INSTITUTION",
      scopeId: scope?.[1] ?? null,
    },
  });
}
const person = (n: string) =>
  db.person.create({
    data: {
      firstName: n,
      lastName: "L",
      gender: "MALE",
      birthDate: new Date("1990-01-01T00:00:00Z"),
      email: `${n}@t.test`,
    },
  });

const mk = async (name = "C1", yId = yearId) => {
  actorId = "qual";
  return ok(
    await run((ctx) =>
      campaigns.createCampaign(ctx, { academicYearId: yId, name, copyFromId: null }),
    ),
  ).campaignId;
};
const draftWithQuestions = async (name = "C1") => {
  const id = await mk(name);
  ok(await run((ctx) => campaigns.setQuestions(ctx, { campaignId: id, questions: QUESTIONS })));
  return id;
};
const open = async (name = "C1") => {
  const id = await draftWithQuestions(name);
  ok(await run((ctx) => campaigns.openCampaign(ctx, id)));
  return id;
};
const answer = (
  userId: string,
  campaignId: string,
  target: string,
  answers: Record<string, unknown>,
) => {
  actorId = userId;
  return run((ctx) => surveys.submitSurvey(ctx, { campaignId, target, answers } as never));
};
const sheet = (n = 4, extra: Record<string, unknown> = {}) => ({ clear: n, ready: n, ...extra });

beforeEach(async () => {
  actorId = "qual";
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "eval_responses", "eval_participations", "eval_campaigns", "teaching_assignments", "year_registrations", "enrollments", "students", "student_groups", "cohorts", "plan_courses", "curriculum_plans", "courses", "staff", "user_roles", "study_programs", "departments", "faculties", "semesters", "academic_years", "system_settings" CASCADE',
  );
  await db.user.deleteMany();
  await db.person.deleteMany();
  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  dep1 = (await db.department.create({ data: { code: "D1", name: "D1", facultyId: f.id } })).id;
  dep2 = (await db.department.create({ data: { code: "D2", name: "D2", facultyId: f.id } })).id;
  const prog = (
    await db.studyProgram.create({
      data: {
        departmentId: dep1,
        cycle: "FIRST",
        code: "P1",
        name: "P1",
        durationYears: 3,
        totalCredits: 180,
      },
    })
  ).id;
  closedYearId = (
    await db.academicYear.create({
      data: {
        code: "2020-2021",
        startDate: new Date("2020-09-01T00:00:00Z"),
        endDate: new Date("2021-08-31T00:00:00Z"),
        status: "CLOSED",
      },
    })
  ).id;
  yearId = (
    await db.academicYear.create({
      data: {
        code: "CUR",
        startDate: new Date("2026-09-01T00:00:00Z"),
        endDate: new Date("2027-08-31T00:00:00Z"),
        status: "CURRENT",
      },
    })
  ).id;
  const plan = (
    await db.curriculumPlan.create({
      data: { programId: prog, version: 1, validFromAcademicYearId: yearId, status: "DRAFT" },
    })
  ).id;
  const course = await db.course.create({
    data: { code: "CA", name: "CA", defaultCredits: 6, departmentId: dep1 },
  });
  const pc = (
    await db.planCourse.create({
      data: { planId: plan, courseId: course.id, yearOfStudy: 1, semester: 1, credits: 6 },
    })
  ).id;
  await db.curriculumPlan.update({ where: { id: plan }, data: { status: "APPROVED" } });
  const cohort = (
    await db.cohort.create({
      data: { programId: prog, startAcademicYearId: yearId, curriculumPlanId: plan, name: "C" },
    })
  ).id;
  const mkGroup = (name: string) =>
    db.studentGroup
      .create({ data: { cohortId: cohort, academicYearId: yearId, yearOfStudy: 1, name } })
      .then((g) => g.id);
  group1 = await mkGroup("G1");
  group2 = await mkGroup("G2");

  const staffOf = async (n: string) => {
    const p = await person(n);
    const st = await db.staff.create({
      data: {
        personId: p.id,
        kind: "ACADEMIC",
        category: "PAE",
        contractStart: new Date("2020-01-01T00:00:00Z"),
      },
    });
    return { staffId: st.id, personId: p.id };
  };
  const l1 = await staffOf("lec1");
  const l2 = await staffOf("lec2");
  const asg = async (groupId: string, staffId: string) =>
    (
      await db.teachingAssignment.create({
        data: {
          groupId,
          planCourseId: pc,
          staffId,
          kind: "LECTURE",
          semester: 1,
          plannedHours: 30,
        },
      })
    ).id;
  a1 = await asg(group1, l1.staffId);
  a2 = await asg(group2, l2.staffId);

  stu = [];
  for (let i = 1; i <= 6; i++) {
    const p = await person(`stu${i}`);
    const st = await db.student.create({ data: { personId: p.id } });
    const en = await db.enrollment.create({
      data: {
        studentId: st.id,
        programId: prog,
        cohortId: cohort,
        registrationType: "FIRST_TIME",
        status: "ACTIVE",
        startedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });
    await db.yearRegistration.create({
      data: {
        enrollmentId: en.id,
        academicYearId: yearId,
        yearOfStudy: 1,
        groupId: i <= 5 ? group1 : group2,
      },
    });
    await user(`u${i}`, "student", p.id, ["SELF", ""]);
    await db.userRole.updateMany({
      where: { userId: `u${i}` },
      data: { scopeType: "SELF", scopeId: null },
    });
    stu.push(`u${i}`);
  }
  await user("qual", "quality");
  await user("lec1", "lecturer", l1.personId);
  await db.userRole.updateMany({
    where: { userId: "lec1" },
    data: { scopeType: "SELF", scopeId: null },
  });
  await user("lec2", "lecturer", l2.personId);
  await db.userRole.updateMany({
    where: { userId: "lec2" },
    data: { scopeType: "SELF", scopeId: null },
  });
  await user("hod1", "head_of_department", undefined, ["DEPARTMENT", dep1]);
  await user("hod2", "head_of_department", undefined, ["DEPARTMENT", dep2]);
});

describe("campaigns (AC-1..AC-3)", () => {
  it("creates a draft, refuses a duplicate name, copies questions and audits", async () => {
    const id = await draftWithQuestions("A");
    expect(await db.evalCampaign.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "DRAFT",
    });
    expect(
      code(
        await run((ctx) =>
          campaigns.createCampaign(ctx, { academicYearId: yearId, name: "A", copyFromId: null }),
        ),
      ),
    ).toBe("CONFLICT:DUPLICATE");
    const copy = ok(
      await run((ctx) =>
        campaigns.createCampaign(ctx, { academicYearId: yearId, name: "B", copyFromId: id }),
      ),
    ).campaignId;
    expect((await getCampaign(copy))?.questionList).toHaveLength(4);
    expect(await db.auditLog.count({ where: { action: "qa.campaign.create" } })).toBe(2);
    expect(
      code(
        await run((ctx) =>
          campaigns.createCampaign(ctx, { academicYearId: "nope", name: "Z", copyFromId: null }),
        ),
      ),
    ).toBe("NOT_FOUND:Academic year not found");
  });

  it("edits questions only in draft and validates them", async () => {
    const id = await mk();
    const bad = await run((ctx) =>
      campaigns.setQuestions(ctx, {
        campaignId: id,
        questions: [QUESTIONS[0], QUESTIONS[0]] as never,
      }),
    );
    expect(code(bad)).toBe("VALIDATION:QUESTIONS");
    expect(
      code(await run((ctx) => campaigns.setQuestions(ctx, { campaignId: id, questions: [] }))),
    ).toBe("VALIDATION:QUESTIONS");
    ok(await run((ctx) => campaigns.setQuestions(ctx, { campaignId: id, questions: QUESTIONS })));
    ok(await run((ctx) => campaigns.openCampaign(ctx, id)));
    expect(
      code(
        await run((ctx) => campaigns.setQuestions(ctx, { campaignId: id, questions: QUESTIONS })),
      ),
    ).toBe("CONFLICT:NOT_DRAFT");
  });

  it("opens only with a scale question and an unclosed year, closes for good", async () => {
    const noScale = await mk("T");
    ok(
      await run((ctx) =>
        campaigns.setQuestions(ctx, { campaignId: noScale, questions: [QUESTIONS[2]] as never }),
      ),
    );
    expect(code(await run((ctx) => campaigns.openCampaign(ctx, noScale)))).toBe(
      "CONFLICT:NO_SCALE_QUESTION",
    );

    const old = await mk("Old", closedYearId);
    ok(await run((ctx) => campaigns.setQuestions(ctx, { campaignId: old, questions: QUESTIONS })));
    expect(code(await run((ctx) => campaigns.openCampaign(ctx, old)))).toBe("CONFLICT:YEAR_CLOSED");

    const id = await open("Good");
    expect(code(await run((ctx) => campaigns.openCampaign(ctx, id)))).toBe("CONFLICT:NOT_DRAFT");
    ok(await run((ctx) => campaigns.closeCampaign(ctx, id)));
    expect(code(await run((ctx) => campaigns.closeCampaign(ctx, id)))).toBe("CONFLICT:NOT_OPEN");
    expect(
      await db.auditLog.count({
        where: { action: { in: ["qa.campaign.open", "qa.campaign.close"] } },
      }),
    ).toBe(2);
  });
});

describe("surveys (AC-4..AC-7)", () => {
  it("lists the student's assignments and the administration while open (AC-4)", async () => {
    expect(await ownSurveys("u1")).toEqual([]);
    const id = await open();
    const list = (await ownSurveys("u1"))!;
    expect(list).toHaveLength(1);
    expect(list[0]!.targets.map((t) => t.target).sort()).toEqual([a1, "ADMIN"].sort());
    expect((await ownSurveys("u6"))![0]!.targets.map((t) => t.target)).toContain(a2);
    expect(await ownSurveys("qual")).toBeNull();
    expect((await surveyForm("u1", id, a1))?.questions.map((q) => q.key)).toEqual([
      "clear",
      "ready",
      "note",
    ]);
    expect(await surveyForm("u1", id, a2)).toBeNull();
  });

  it("stores response and participation apart, once per target (AC-5, AC-6)", async () => {
    const id = await open();
    ok(await answer("u1", id, a1, sheet(5, { note: "Mirë" })));
    ok(await answer("u1", id, "ADMIN", { desk: 3 }));
    expect(code(await answer("u1", id, a1, sheet()))).toBe("CONFLICT:ALREADY_ANSWERED");
    expect(await db.evalParticipation.count()).toBe(2);
    expect(await db.evalResponse.count()).toBe(2);
    // the response row has no student, no timestamp, no reference to the participation
    const cols = await db.$queryRawUnsafe<{ column_name: string }[]>(
      "select column_name from information_schema.columns where table_name = 'eval_responses'",
    );
    expect(cols.map((c) => c.column_name).sort()).toEqual([
      "answers",
      "assignment_id",
      "campaign_id",
      "id",
      "section",
    ]);
    expect(await surveyForm("u1", id, a1)).toBeNull();
    expect((await ownSurveys("u1"))![0]!.targets.every((t) => t.done)).toBe(true);
  });

  it("refuses foreign targets, bad answers, closed or draft campaigns, and users without a student", async () => {
    const draft = await draftWithQuestions("D");
    expect(code(await answer("u1", draft, a1, sheet()))).toBe("CONFLICT:NOT_OPEN");
    const id = await open();
    expect(code(await answer("u1", id, a2, sheet()))).toBe("NOT_FOUND:NOT_YOUR_TARGET");
    expect(code(await answer("u1", id, "ghost", sheet()))).toBe("NOT_FOUND:NOT_YOUR_TARGET");
    expect(code(await answer("u1", id, a1, { clear: 9, ready: 3 }))).toBe("VALIDATION:ANSWERS");
    expect(code(await answer("u1", id, a1, { clear: 3 }))).toBe("VALIDATION:ANSWERS");
    expect(code(await answer("u1", id, a1, { ...sheet(), desk: 3 }))).toBe("VALIDATION:ANSWERS");
    expect(code(await answer("qual", id, a1, sheet()))).toBe("NOT_FOUND:NO_STUDENT");
    expect(await db.evalResponse.count()).toBe(0);
    expect(await db.evalParticipation.count()).toBe(0);
    ok(await run((ctx) => campaigns.closeCampaign(ctx, id)));
    expect(code(await answer("u1", id, a1, sheet()))).toBe("CONFLICT:NOT_OPEN");
  });

  it("ignores students that are not active in the year", async () => {
    const id = await open();
    await db.enrollment.updateMany({
      where: { student: { person: { email: "stu1@t.test" } } },
      data: { status: "SUSPENDED" },
    });
    expect(code(await answer("u1", id, a1, sheet()))).toBe("NOT_FOUND:NOT_YOUR_TARGET");
  });

  it("keeps answers and response ids out of the audit trail (AC-7)", async () => {
    const id = await open();
    ok(await answer("u1", id, a1, sheet(5, { note: "Sekret i madh" })));
    const rows = await db.auditLog.findMany({ where: { action: "qa.survey.submit" } });
    expect(rows).toHaveLength(1);
    const text = JSON.stringify(rows[0]);
    expect(text).not.toContain("Sekret");
    expect(text).not.toContain("clear");
    const response = await db.evalResponse.findFirstOrThrow();
    expect(text).not.toContain(response.id);
    expect(rows[0]).toMatchObject({ entityType: "EvalCampaign", entityId: id });
  });

  it("shows the quality officer counts of participation (AC-10)", async () => {
    const id = await open();
    ok(await answer("u1", id, a1, sheet()));
    ok(await answer("u2", id, a1, sheet()));
    const detail = (await getCampaign(id))!;
    const row = detail.participation.find((p) => p.target === a1)!;
    expect(row).toMatchObject({ eligible: 5, answered: 2 });
    expect(detail.participation.find((p) => p.target === "ADMIN")).toMatchObject({
      eligible: 6,
      answered: 0,
    });
  });
});

describe("results (AC-8, AC-9, AC-11)", () => {
  async function closedCampaign(responders = 5) {
    const id = await open();
    for (let i = 1; i <= responders; i++)
      ok(await answer(`u${i}`, id, a1, sheet((i % 5) + 1, i === 1 ? { note: "Koment një" } : {})));
    ok(await answer("u1", id, "ADMIN", { desk: 4 }));
    ok(await answer("u6", id, a2, sheet(2)));
    actorId = "qual";
    ok(await run((ctx) => campaigns.closeCampaign(ctx, id)));
    return id;
  }

  it("shows nothing while the campaign is not closed", async () => {
    const id = await open();
    expect(await campaignResults({ id: "qual" }, id)).toBeNull();
    expect(await targetResults({ id: "qual" }, id, a1)).toBeNull();
  });

  it("withholds targets under the minimum and shows the rest (AC-8, AC-9)", async () => {
    const id = await closedCampaign();
    const r = (await campaignResults({ id: "qual" }, id))!;
    const row1 = r.rows.find((x) => x.target === a1)!;
    const row2 = r.rows.find((x) => x.target === a2)!;
    expect(row2.result).toEqual({ withheld: true, minResponses: 5 });
    expect(row1.result).toMatchObject({ withheld: false, responses: 5 });
    if (row1.result.withheld) throw new Error();
    // answers 2,3,4,5,1 -> mean 3
    expect(row1.result.overall).toBe(3);
    expect(row1.result.questions[0]).toMatchObject({ mean: 3, distribution: [1, 1, 1, 1, 1] });
    // the administration has one answer: withheld
    expect(r.administration).toEqual({ withheld: true, minResponses: 5 });
  });

  it("honours the setting for the minimum", async () => {
    await db.systemSetting.create({ data: { key: "qa.minResponses", value: 1 } });
    const id = await closedCampaign(2);
    const r = (await campaignResults({ id: "qual" }, id))!;
    expect(r.rows.find((x) => x.target === a2)!.result).toMatchObject({
      withheld: false,
      overall: 2,
    });
    expect(r.administration).toMatchObject({ withheld: false, overall: 4 });
    const dep = r.departments.find((d) => d.code === "D1")!;
    expect(dep.result).toMatchObject({ withheld: false, responses: 3 });
  });

  it("limits rows by viewer and gives comments, departments and administration to quality only (AC-11)", async () => {
    await db.systemSetting.create({ data: { key: "qa.minResponses", value: 1 } });
    const id = await closedCampaign(5);
    const quality = (await campaignResults({ id: "qual" }, id))!;
    expect(quality.rows).toHaveLength(2);
    expect(quality.institution).toBe(true);
    expect(quality.administration).not.toBeNull();
    const withComments = quality.rows.find((x) => x.target === a1)!.result;
    if (withComments.withheld) throw new Error();
    expect(withComments.comments[0]!.texts).toEqual(["Koment një"]);

    const hod1 = (await campaignResults({ id: "hod1" }, id))!;
    expect(hod1.rows.map((x) => x.target).sort()).toEqual([a1, a2].sort());
    expect(hod1.administration).toBeNull();
    expect(hod1.departments).toEqual([]);
    const hodResult = hod1.rows.find((x) => x.target === a1)!.result;
    if (hodResult.withheld) throw new Error();
    expect(hodResult.comments).toEqual([]);

    expect((await campaignResults({ id: "hod2" }, id))!.rows).toEqual([]);
    expect((await campaignResults({ id: "lec1" }, id))!.rows.map((x) => x.target)).toEqual([a1]);
    expect((await campaignResults({ id: "lec2" }, id))!.rows.map((x) => x.target)).toEqual([a2]);
    expect(await campaignResults({ id: "u1" }, id)).toBeNull();
  });

  it("opens target details only to those who may see the target (AC-11)", async () => {
    await db.systemSetting.create({ data: { key: "qa.minResponses", value: 1 } });
    const id = await closedCampaign(5);
    expect(await targetResults({ id: "lec1" }, id, a1)).not.toBeNull();
    expect(await targetResults({ id: "lec1" }, id, a2)).toBeNull();
    expect(await targetResults({ id: "hod2" }, id, a1)).toBeNull();
    expect(await targetResults({ id: "lec1" }, id, "ADMIN")).toBeNull();
    expect(await targetResults({ id: "u1" }, id, a1)).toBeNull();
    const admin = await targetResults({ id: "qual" }, id, "ADMIN");
    expect(admin?.result).toMatchObject({ withheld: false, overall: 4 });
    const detail = await targetResults({ id: "qual" }, id, a1);
    expect(detail?.title).toMatchObject({ courseCode: "CA" });
  });
});
