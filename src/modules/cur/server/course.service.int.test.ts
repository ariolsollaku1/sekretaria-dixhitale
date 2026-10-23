import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { can } from "@/lib/authz/guard";
import { db, withTransaction } from "@/lib/db";
import "@/modules/org";
import "@/modules/cur";
import * as categories from "./category.service";
import { registerCourseDependent, resetCourseDependents } from "./course-dependents";
import { listCategories, writableDepartments } from "./course.queries";
import * as courses from "./course.service";

type Actor = { id: string; email: string; name: string; locale: null; personId: null };
let admin: Actor, head1: Actor, secretary: Actor;
let d1: string, d2: string;

function runAs<R>(
  user: Actor,
  fn: (ctx: ActionContext) => Promise<R>,
  reason?: string,
  permission = "cur.course.write",
): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => user,
    can,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission,
    input: z.object({}).passthrough(),
    requireReason: reason !== undefined,
    handler: (_i, ctx) => fn(ctx),
  })({ reason } as never);
}
const idOf = <T extends { id: string }>(r: ActionResult<T>) => (r.ok ? r.data.id : "");

async function user(
  email: string,
  roles: {
    role: "sysadmin" | "head_of_department" | "secretary";
    scopeType: "INSTITUTION" | "DEPARTMENT";
    scopeId?: string;
  }[],
): Promise<Actor> {
  const u = await db.user.create({ data: { email, name: email } });
  for (const r of roles)
    await db.userRole.create({
      data: { userId: u.id, role: r.role, scopeType: r.scopeType, scopeId: r.scopeId ?? null },
    });
  return { id: u.id, email, name: email, locale: null, personId: null };
}

const input = (over: Partial<Parameters<typeof courses.createCourse>[1]> = {}) => ({
  code: "EC101",
  name: "Mikroekonomi",
  nameEn: null,
  defaultCredits: 6,
  categoryId: null,
  hoursLecture: 30,
  hoursSeminar: 15,
  hoursLab: 0,
  departmentId: d1,
  ...over,
});

beforeEach(async () => {
  resetCourseDependents();
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "user_roles", "courses", "course_categories", "study_programs", "departments", "faculties" CASCADE',
  );
  await db.user.deleteMany();
  const faculty = await db.faculty.create({ data: { code: "FE", name: "Fakulteti" } });
  d1 = (
    await db.department.create({ data: { code: "ECO", name: "Ekonomi", facultyId: faculty.id } })
  ).id;
  d2 = (
    await db.department.create({ data: { code: "LAW", name: "E drejta", facultyId: faculty.id } })
  ).id;
  admin = await user("admin@t.test", [{ role: "sysadmin", scopeType: "INSTITUTION" }]);
  head1 = await user("head1@t.test", [
    { role: "head_of_department", scopeType: "DEPARTMENT", scopeId: d1 },
  ]);
  secretary = await user("sec@t.test", [{ role: "secretary", scopeType: "INSTITUTION" }]);
});

describe("scoped writes (AC-3, AC-4)", () => {
  it("a sysadmin writes in any department; a head of department only in theirs", async () => {
    expect(
      await runAs(admin, (c) => courses.createCourse(c, input({ code: "A1", departmentId: d2 }))),
    ).toMatchObject({ ok: true });
    expect(
      await runAs(head1, (c) => courses.createCourse(c, input({ code: "H1", departmentId: d1 }))),
    ).toMatchObject({ ok: true });
    expect(
      await runAs(head1, (c) => courses.createCourse(c, input({ code: "H2", departmentId: d2 }))),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(
      await runAs(secretary, (c) => courses.createCourse(c, input({ code: "S1" }))),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await db.course.count()).toBe(2);
  });

  it("updating checks the current department; moving needs both (AC-4)", async () => {
    const id = idOf(await runAs(head1, (c) => courses.createCourse(c, input())));
    expect(
      await runAs(head1, (c) => courses.updateCourse(c, id, input({ name: "Renamed" }))),
    ).toMatchObject({ ok: true });
    expect(
      await runAs(head1, (c) => courses.updateCourse(c, id, input({ departmentId: d2 }))),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect((await db.course.findUniqueOrThrow({ where: { id } })).departmentId).toBe(d1);
    expect(
      await runAs(admin, (c) => courses.updateCourse(c, id, input({ departmentId: d2 }))),
    ).toMatchObject({ ok: true });
    // now it lives in d2: the former owner can no longer touch it
    expect(
      await runAs(head1, (c) =>
        courses.updateCourse(c, id, input({ departmentId: d2, name: "x" })),
      ),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await runAs(head1, (c) => courses.deactivateCourse(c, id), "x")).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });

  it("lists exactly the departments a user may write (queries)", async () => {
    expect((await writableDepartments(admin)).map((d) => d.label)).toEqual([
      "FE / ECO — Ekonomi",
      "FE / LAW — E drejta",
    ]);
    expect((await writableDepartments(head1)).map((d) => d.label)).toEqual(["FE / ECO — Ekonomi"]);
    expect(await writableDepartments(secretary)).toEqual([]);
    const facultyHead = await user("fh@t.test", [{ role: "sysadmin", scopeType: "INSTITUTION" }]);
    expect(await writableDepartments(facultyHead)).toHaveLength(2);
  });
});

describe("createCourse / updateCourse (AC-1, AC-3, AC-5)", () => {
  it("creates and audits with before/after on update", async () => {
    const id = idOf(
      await runAs(admin, (c) => courses.createCourse(c, input({ nameEn: "Microeconomics" }))),
    );
    expect(await db.course.findUniqueOrThrow({ where: { id } })).toMatchObject({
      code: "EC101",
      defaultCredits: 6,
      hoursLecture: 30,
      active: true,
      createdById: admin.id,
    });
    await runAs(admin, (c) => courses.updateCourse(c, id, input({ defaultCredits: 7 })));
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "cur.course.update" } }),
    ).toMatchObject({ before: { defaultCredits: 6 }, after: { defaultCredits: 7 } });
  });

  it("refuses duplicate codes (also racing), inactive or unknown references", async () => {
    await runAs(admin, (c) => courses.createCourse(c, input()));
    expect(await runAs(admin, (c) => courses.createCourse(c, input()))).toMatchObject({
      ok: false,
      error: { fieldErrors: { code: ["codeTaken"] } },
    });
    const [a, b] = await Promise.all([
      runAs(admin, (c) => courses.createCourse(c, input({ code: "RACE" }))),
      runAs(admin, (c) => courses.createCourse(c, input({ code: "RACE" }))),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(
      await runAs(admin, (c) =>
        courses.createCourse(c, input({ code: "X1", departmentId: "nope" })),
      ),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(
      await runAs(admin, (c) => courses.createCourse(c, input({ code: "X2", categoryId: "nope" }))),
    ).toMatchObject({ ok: false, error: { fieldErrors: { categoryId: ["categoryNotFound"] } } });
    await db.department.update({ where: { id: d2 }, data: { active: false } });
    expect(
      await runAs(admin, (c) => courses.createCourse(c, input({ code: "X3", departmentId: d2 }))),
    ).toMatchObject({
      ok: false,
      error: { fieldErrors: { departmentId: ["departmentInactive"] } },
    });
  });

  it("reports unknown courses", async () => {
    expect(await runAs(admin, (c) => courses.updateCourse(c, "nope", input()))).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});

describe("categories (AC-2)", () => {
  const cat = (over = {}) => ({
    code: "COMPULSORY",
    nameSq: "E detyrueshme",
    nameEn: "Compulsory",
    ...over,
  });
  const asAdmin = <R>(fn: (c: ActionContext) => Promise<R>, reason?: string) =>
    runAs(admin, fn, reason, "cur.category.write");

  it("creates, edits, deactivates with a reason and refuses duplicates", async () => {
    const id = idOf(await asAdmin((c) => categories.createCategory(c, cat())));
    expect(await asAdmin((c) => categories.createCategory(c, cat()))).toMatchObject({
      ok: false,
      error: { fieldErrors: { code: ["codeTaken"] } },
    });
    expect(
      await asAdmin((c) => categories.updateCategory(c, id, cat({ nameEn: "Mandatory" }))),
    ).toMatchObject({ ok: true });
    expect(
      await asAdmin((c) => categories.setCategoryActive(c, id, false), "obsolete"),
    ).toMatchObject({ ok: true });
    expect(await asAdmin((c) => categories.setCategoryActive(c, id, false), "x")).toMatchObject({
      ok: false,
      error: { message: "ALREADY_INACTIVE" },
    });
    expect((await listCategories(true)).map((x) => x.code)).toEqual([]);
    expect((await listCategories()).map((x) => x.code)).toEqual(["COMPULSORY"]);
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "cur.category.deactivate" } }),
    ).toMatchObject({ reason: "obsolete" });
    expect(await asAdmin((c) => categories.updateCategory(c, "nope", cat()))).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("an inactive category cannot be chosen for a course, but an existing course keeps it on edit", async () => {
    const cid = idOf(await asAdmin((c) => categories.createCategory(c, cat())));
    const id = idOf(await runAs(admin, (c) => courses.createCourse(c, input({ categoryId: cid }))));
    await asAdmin((c) => categories.setCategoryActive(c, cid, false), "x");
    expect(
      await runAs(admin, (c) => courses.createCourse(c, input({ code: "NEW", categoryId: cid }))),
    ).toMatchObject({ ok: false, error: { fieldErrors: { categoryId: ["categoryInactive"] } } });
    expect(
      await runAs(admin, (c) =>
        courses.updateCourse(c, id, input({ categoryId: cid, name: "Still fine" })),
      ),
    ).toMatchObject({ ok: true });
  });
});

describe("status (AC-6)", () => {
  it("deactivates with a reason; a dependent blocks it; reactivation needs an active department", async () => {
    const id = idOf(await runAs(admin, (c) => courses.createCourse(c, input())));
    registerCourseDependent({
      id: "plans",
      labelKey: "cur.dependents.plans",
      countActive: async () => 3,
    });
    expect(await runAs(admin, (c) => courses.deactivateCourse(c, id), "x")).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "HAS_DEPENDENTS:cur.dependents.plans=3" },
    });
    resetCourseDependents();
    expect(
      await runAs(admin, (c) => courses.deactivateCourse(c, id), "no longer taught"),
    ).toMatchObject({ ok: true });
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "cur.course.deactivate" } }),
    ).toMatchObject({ reason: "no longer taught" });
    expect(await runAs(admin, (c) => courses.deactivateCourse(c, id), "x")).toMatchObject({
      ok: false,
      error: { message: "ALREADY_INACTIVE" },
    });
    await db.department.update({ where: { id: d1 }, data: { active: false } });
    expect(await runAs(admin, (c) => courses.reactivateCourse(c, id), "x")).toMatchObject({
      ok: false,
      error: { message: "DEPARTMENT_INACTIVE" },
    });
    await db.department.update({ where: { id: d1 }, data: { active: true } });
    expect(await runAs(admin, (c) => courses.reactivateCourse(c, id), "back")).toMatchObject({
      ok: true,
    });
    expect(await runAs(admin, (c) => courses.reactivateCourse(c, id), "x")).toMatchObject({
      ok: false,
      error: { message: "ALREADY_ACTIVE" },
    });
  });
});
