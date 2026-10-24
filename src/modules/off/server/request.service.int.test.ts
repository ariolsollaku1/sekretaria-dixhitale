import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import { listAuthenticatedForms } from "@/lib/forms/queries";
import { changeState, submitAuthenticated } from "@/lib/forms/submission.service";
import "@/modules/off";
import { STAFF_FORMS } from "../domain/request-forms";
import { myRequests, requestingStaff, staffHistory, submittableForms } from "./request.queries";

let actorId = "lec-1";
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
    permission: "off.request.submit",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};
const message = <T>(r: ActionResult<T>): string => (r.ok ? "ok" : r.error.message);

type Role = "lecturer" | "head_of_department" | "administration" | "student" | "sysadmin" | "hr";
async function mkUser(id: string, role: Role) {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id } });
  await db.userRole.create({
    data: { userId: id, role, scopeType: role === "student" ? "SELF" : "INSTITUTION" },
  });
}

const leave = (startDate: string, endDate: string) => ({
  leaveType: "annual",
  startDate,
  endDate,
  reason: "Rest",
});

async function submitLeave(user: string, start = "2026-12-01", end = "2026-12-10") {
  actorId = user;
  return ok(await run((ctx) => submitAuthenticated(ctx, "staff-leave", leave(start, end))));
}
const move = async (user: string, id: string, to: string) => {
  actorId = user;
  return run((ctx) => changeState(ctx, id, to, null));
};

beforeEach(async () => {
  await db.$executeRawUnsafe('ALTER TABLE "form_definitions" DISABLE TRIGGER USER');
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "notifications", "email_outbox", "rate_limit_hits", "form_submission_events", "form_submissions", "form_definitions", "stored_files", "user_roles" CASCADE',
  );
  await db.$executeRawUnsafe('ALTER TABLE "form_definitions" ENABLE TRIGGER USER');
  await db.user.deleteMany();
  await mkUser("lec-1", "lecturer");
  await mkUser("lec-2", "lecturer");
  await mkUser("hod-1", "head_of_department");
  await mkUser("adm-1", "administration");
  await mkUser("hr-1", "hr");
  await mkUser("stu-1", "student");
  await mkUser("sys-1", "sysadmin");
  for (const form of STAFF_FORMS)
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
});

describe("who may submit (AC-1, AC-2, AC-10)", () => {
  it("lists the four forms for staff and none for a student", async () => {
    expect((await submittableForms("lec-1")).map((f) => f.key)).toEqual([
      "staff-leave",
      "staff-supplies",
      "staff-certificate",
      "staff-authorization",
    ]);
    expect(await submittableForms("stu-1")).toEqual([]);
    expect(await listAuthenticatedForms("stu-1")).toEqual([]);
    expect(await listAuthenticatedForms("lec-1")).toHaveLength(4);
  });
  it("refuses a student as if the form did not exist", async () => {
    actorId = "stu-1";
    const r = await run((ctx) =>
      submitAuthenticated(ctx, "staff-leave", leave("2026-12-01", "2026-12-02")),
    );
    expect(message(r)).toBe("Form not found");
    expect(await db.formSubmission.count()).toBe(0);
  });
});

describe("approval chain (AC-3, AC-4, AC-5, AC-7)", () => {
  it("runs supervisor then administration and notifies the submitter each time", async () => {
    const { submissionId } = await submitLeave("lec-1");
    ok(await move("hod-1", submissionId, "supervisor_approved"));
    ok(await move("adm-1", submissionId, "approved"));
    const row = await db.formSubmission.findUniqueOrThrow({ where: { id: submissionId } });
    expect(row.state).toBe("approved");
    const events = await db.formSubmissionEvent.findMany({
      where: { submissionId, kind: "STATE" },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((e) => e.toState)).toEqual(["supervisor_approved", "approved"]);
    expect(
      await db.notification.count({ where: { userId: "lec-1", type: "plt.form-status" } }),
    ).toBe(2);
    expect(
      await db.auditLog.count({
        where: { action: "plt.form_submission.change_state", entityId: submissionId },
      }),
    ).toBe(2);
  });

  it("refuses a step to the wrong role", async () => {
    const { submissionId } = await submitLeave("lec-1");
    expect(message(await move("adm-1", submissionId, "supervisor_approved"))).toBe(
      "TRANSITION_NOT_ALLOWED",
    );
    expect(message(await move("hod-1", submissionId, "approved"))).toBe("TRANSITION_NOT_ALLOWED");
    // lecturers are no handlers of the form at all: it does not exist for them
    expect(message(await move("lec-2", submissionId, "rejected"))).toBe("Submission not found");
    ok(await move("hod-1", submissionId, "supervisor_approved"));
    expect(message(await move("hod-1", submissionId, "approved"))).toBe("TRANSITION_NOT_ALLOWED");
  });

  it("refuses to decide on one's own request, except for the sysadmin", async () => {
    const own = await submitLeave("hod-1");
    expect(message(await move("hod-1", own.submissionId, "supervisor_approved"))).toBe(
      "OWN_REQUEST",
    );
    ok(await move("adm-1", own.submissionId, "approved")); // administration decides at once
    const adm = await submitLeave("adm-1");
    expect(message(await move("adm-1", adm.submissionId, "approved"))).toBe("OWN_REQUEST");
    const sys = await submitLeave("sys-1");
    ok(await move("sys-1", sys.submissionId, "approved"));
  });

  it("keeps supplies with administration alone", async () => {
    actorId = "lec-1";
    const { submissionId } = ok(
      await run((ctx) => submitAuthenticated(ctx, "staff-supplies", { items: "Paper 5 reams" })),
    );
    expect(message(await move("hod-1", submissionId, "in_progress"))).toBe("Submission not found");
    ok(await move("adm-1", submissionId, "in_progress"));
    ok(await move("adm-1", submissionId, "approved"));
  });
});

describe("leave dates on approval (AC-6)", () => {
  it("refuses and rolls back an end before the start, but allows rejecting it", async () => {
    const { submissionId } = await submitLeave("lec-1", "2026-12-10", "2026-12-01");
    expect(message(await move("adm-1", submissionId, "approved"))).toBe("INVALID_LEAVE_DATES");
    expect((await db.formSubmission.findUniqueOrThrow({ where: { id: submissionId } })).state).toBe(
      "new",
    );
    ok(await move("adm-1", submissionId, "rejected"));
  });
});

describe("history per staff member (AC-8, AC-9)", () => {
  it("lists the requests of each person only, with period and state", async () => {
    const a = await submitLeave("lec-1");
    await submitLeave("lec-2", "2027-01-05", "2027-01-06");
    ok(await move("hod-1", a.submissionId, "supervisor_approved"));
    // another kind of form is not a staff request
    const mine = await myRequests("lec-1");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      reference: a.reference,
      formKey: "staff-leave",
      state: "supervisor_approved",
      from: "2026-12-01",
      to: "2026-12-10",
    });
    expect(await staffHistory("lec-2")).toHaveLength(1);
    expect(await staffHistory("hr-1")).toEqual([]);
    const people = await requestingStaff();
    expect(people.map((p) => [p.id, p.count])).toEqual([
      ["lec-1", 1],
      ["lec-2", 1],
    ]);
  });
});
