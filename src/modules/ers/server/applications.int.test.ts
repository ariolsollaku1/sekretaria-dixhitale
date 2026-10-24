import { beforeEach, describe, expect, it } from "vitest";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { z } from "zod";
import { db, withTransaction } from "@/lib/db";
import { changeState, submitAuthenticated, submitPublic } from "@/lib/forms/submission.service";
import { DEFAULT_PAGE_SIZE } from "@/lib/tables/types";
import "@/modules/ers";
import { ERASMUS_FORMS } from "../domain/erasmus-forms";
import { erasmusApplicationsTable } from "./applications.table";

let actorId = "erasmus-1";
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
    permission: "plt.form.inbox",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};

const params = (filters: Record<string, string> = {}) => ({
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  sort: { key: "submittedAt", dir: "desc" as const },
  filters,
  columns: [],
});
const rows = async (user: string, filters: Record<string, string> = {}) =>
  (await erasmusApplicationsTable.fetch(params(filters), { user: { id: user } })).rows;

async function mkUser(id: string, role: "sysadmin" | "secretary" | "student" | "erasmus" | "hr") {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id } });
  await db.userRole.create({
    data: { userId: id, role, scopeType: role === "student" ? "SELF" : "INSTITUTION" },
  });
}

let studentNumber: string;
const staffEmail = "Staff.Member@logos.test";

const studentAnswers = (over: Record<string, unknown> = {}) => ({
  firstName: "Ana",
  lastName: "Leka",
  email: "ana@example.test",
  studentNumber,
  birthDate: "2003-04-05",
  program: "Informatikë",
  yearOfStudy: 2,
  destination: "University of Graz",
  mobilityType: "study",
  period: "autumn",
  academicYear: "2027/2028",
  motivation: "Dua të studioj jashtë.",
  confirm: true,
  ...over,
});
const staffAnswers = (over: Record<string, unknown> = {}) => ({
  firstName: "Besa",
  lastName: "Dedja",
  email: staffEmail.toLowerCase(),
  department: "Informatikë",
  position: "Lektore",
  destination: "TU Wien",
  mobilityType: "teaching",
  startDate: "2027-03-01",
  endDate: "2027-03-05",
  motivation: "Shkëmbim përvoje.",
  confirm: true,
  ...over,
});

beforeEach(async () => {
  await db.$executeRawUnsafe('ALTER TABLE "form_definitions" DISABLE TRIGGER USER');
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "notifications", "email_outbox", "rate_limit_hits", "form_submission_events", "form_submissions", "form_definitions", "stored_files", "enrollments", "students", "staff", "user_roles" CASCADE',
  );
  await db.$executeRawUnsafe('ALTER TABLE "form_definitions" ENABLE TRIGGER USER');
  await db.user.deleteMany();
  await db.person.deleteMany();
  for (const form of ERASMUS_FORMS)
    await db.formDefinition.create({
      data: {
        key: form.key,
        version: 1,
        status: "PUBLISHED",
        audience: form.audience,
        ownerRoles: form.ownerRoles,
        definition: form.definition as never,
        publishedAt: new Date(),
      },
    });
  // a form of another module, never listed
  await db.formDefinition.create({
    data: {
      key: "other-form",
      version: 1,
      status: "PUBLISHED",
      audience: "PUBLIC",
      ownerRoles: ["erasmus"],
      definition: {
        title: { sq: "Tjetër" },
        fields: [{ key: "a", type: "text", label: { sq: "A" } }],
        workflow: {
          initial: "new",
          states: [{ key: "new", label: { sq: "E re" }, final: true }],
          transitions: [],
        },
      } as never,
      publishedAt: new Date(),
    },
  });
  actorId = "erasmus-1";
  await mkUser("erasmus-1", "erasmus");
  await mkUser("admin", "sysadmin");
  await mkUser("sec-1", "secretary");
  await mkUser("stu-user", "student");

  const person = await db.person.create({
    data: {
      firstName: "Ana",
      lastName: "Leka",
      gender: "FEMALE",
      birthDate: new Date("2003-04-05T00:00:00Z"),
      email: "ana@student.test",
    },
  });
  const student = await db.student.create({ data: { personId: person.id } });
  studentNumber = student.studentNumber;
  await db.user.update({ where: { id: "stu-user" }, data: { personId: person.id } });

  const sp = await db.person.create({
    data: {
      firstName: "Besa",
      lastName: "Dedja",
      gender: "FEMALE",
      birthDate: new Date("1985-01-01T00:00:00Z"),
      email: staffEmail,
    },
  });
  await db.staff.create({
    data: {
      personId: sp.id,
      kind: "ACADEMIC",
      category: "PAE",
      contractStart: new Date("2020-01-01T00:00:00Z"),
    },
  });
});

const publicApply = async (key: string, answers: Record<string, unknown>) => {
  const res = await submitPublic(key, answers, "10.0.0.1");
  if (!res.ok) throw new Error(JSON.stringify(res));
  return res.reference;
};

describe("Erasmus applications list (AC-4, AC-7)", () => {
  it("lists only Erasmus submissions, with kind, destination, period and state", async () => {
    await publicApply("erasmus-student", studentAnswers());
    await publicApply("erasmus-academic", staffAnswers());
    await publicApply("other-form", { a: "x" });
    const list = await rows("erasmus-1");
    expect(list).toHaveLength(2);
    const student = list.find((r) => r.kind === "student")!;
    expect(student).toMatchObject({
      name: "Ana Leka",
      email: "ana@example.test",
      destination: "University of Graz",
      state: "submitted",
    });
    expect(list.find((r) => r.kind === "academic")!.answers.startDate).toBe("2027-03-01");
  });

  it("filters by kind and state", async () => {
    await publicApply("erasmus-student", studentAnswers());
    const ref = await publicApply("erasmus-academic", staffAnswers());
    expect(await rows("erasmus-1", { kind: "student" })).toHaveLength(1);
    expect(await rows("erasmus-1", { kind: "admin" })).toHaveLength(0);
    const id = (await db.formSubmission.findUniqueOrThrow({ where: { reference: ref } })).id;
    ok(await run((ctx) => changeState(ctx, id, "shortlisted", "ok")));
    expect(await rows("erasmus-1", { state: "shortlisted" })).toHaveLength(1);
    expect(await rows("erasmus-1", { state: "submitted" })).toHaveLength(1);
  });

  it("a user who does not handle the forms sees no row, the sysadmin all", async () => {
    await publicApply("erasmus-student", studentAnswers());
    expect(await rows("sec-1")).toHaveLength(0);
    expect(await rows("stu-user")).toHaveLength(0);
    expect(await rows("admin")).toHaveLength(1);
  });

  it("the Erasmus officer moves an application through the workflow (AC-2, AC-8)", async () => {
    const ref = await publicApply("erasmus-student", studentAnswers());
    const id = (await db.formSubmission.findUniqueOrThrow({ where: { reference: ref } })).id;
    for (const to of ["shortlisted", "selected", "mobility_done"])
      ok(await run((ctx) => changeState(ctx, id, to, "ok")));
    expect((await rows("erasmus-1"))[0]!.state).toBe("mobility_done");
    // a final state has no exit
    const again = await run((ctx) => changeState(ctx, id, "selected", "no"));
    expect(again.ok).toBe(false);
    // rejection is possible from selected, not from submitted-to-done
    const ref2 = await publicApply("erasmus-student", studentAnswers());
    const id2 = (await db.formSubmission.findUniqueOrThrow({ where: { reference: ref2 } })).id;
    expect((await run((ctx) => changeState(ctx, id2, "mobility_done", "x"))).ok).toBe(false);
    ok(await run((ctx) => changeState(ctx, id2, "rejected", "no place")));
  });
});

describe("known applicants (AC-5, AC-6)", () => {
  it("a public student application is linked by number and date of birth, both required", async () => {
    await publicApply("erasmus-student", studentAnswers());
    await publicApply("erasmus-student", studentAnswers({ birthDate: "2003-04-06" }));
    await publicApply("erasmus-student", studentAnswers({ studentNumber: "999999" }));
    const list = await rows("erasmus-1");
    expect(list.filter((r) => r.known)).toHaveLength(1);
    expect(list.find((r) => r.known)!.known).toMatchObject({
      kind: "student",
      label: studentNumber,
    });
  });

  it("a public staff application is linked by the e-mail of the staff member's person", async () => {
    await publicApply("erasmus-admin", staffAnswers({ department: undefined, unit: "Zyra" }));
    await publicApply("erasmus-academic", staffAnswers({ email: "other@logos.test" }));
    const list = await rows("erasmus-1");
    expect(list.filter((r) => r.known).map((r) => r.known!.kind)).toEqual(["staff"]);
  });

  it("a signed-in application is linked through the submitter's person", async () => {
    actorId = "stu-user";
    ok(
      await run((ctx) =>
        submitAuthenticated(ctx, "erasmus-student-portal", {
          program: "Informatikë",
          yearOfStudy: 2,
          destination: "Uni Wien",
          mobilityType: "traineeship",
          period: "year",
          academicYear: "2027/2028",
          motivation: "Praktikë",
          confirm: true,
        }),
      ),
    );
    const list = await rows("erasmus-1");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "stu-user", destination: "Uni Wien" });
    expect(list[0]!.known?.kind).toBe("student");
  });

  it("the link is offered only to those who may read the record", async () => {
    await publicApply("erasmus-student", studentAnswers());
    await publicApply("erasmus-academic", staffAnswers());
    for (const r of await rows("erasmus-1")) expect(r.known?.href).toBeNull();
    for (const r of await rows("admin"))
      expect(r.known?.href).toMatch(/^\/(stu\/students|hr\/staff)\//);
  });
});
