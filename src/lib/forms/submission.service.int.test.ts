import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import * as defs from "./definition.service";
import { registerFormHandler, resetFormHandlers } from "./handlers";
import { getSubmission, inboxWhere } from "./queries";
import * as subs from "./submission.service";

let actorId = "admin";
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

const definition = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    title: { sq: "Kërkesë", en: "Request" },
    fields: [
      { key: "name", type: "text", label: { sq: "Emri" }, required: true, max: 50 },
      {
        key: "kind",
        type: "select",
        label: { sq: "Lloji" },
        options: [
          { value: "a", label: { sq: "A" } },
          { value: "b", label: { sq: "B" } },
        ],
      },
      {
        key: "other",
        type: "text",
        label: { sq: "Tjetër" },
        required: true,
        showIf: { field: "kind", equals: "b" },
      },
    ],
    workflow: {
      initial: "new",
      states: [
        { key: "new", label: { sq: "E re", en: "New" } },
        { key: "review", label: { sq: "Në shqyrtim", en: "In review" } },
        {
          key: "approved",
          label: { sq: "Miratuar", en: "Approved" },
          kind: "approved",
          final: true,
        },
        { key: "rejected", label: { sq: "Refuzuar" }, kind: "rejected", final: true },
      ],
      transitions: [
        { from: "new", to: "review" },
        { from: "review", to: "approved" },
        { from: "review", to: "rejected" },
      ],
    },
    ...extra,
  });

async function publishForm(
  key: string,
  audience: "PUBLIC" | "AUTHENTICATED",
  extra: Record<string, unknown> = {},
  roles = ["secretary"],
) {
  const { definitionId } = ok(
    await run((ctx) =>
      defs.createDraft(ctx, key, { audience, ownerRoles: roles, definition: definition(extra) }),
    ),
  );
  ok(await run((ctx) => defs.publish(ctx, definitionId)));
  return definitionId;
}
async function user(id: string, role: "sysadmin" | "secretary" | "finance" | "student") {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id } });
  await db.userRole.create({
    data: { userId: id, role, scopeType: role === "student" ? "SELF" : "INSTITUTION" },
  });
}

beforeEach(async () => {
  resetFormHandlers();
  await db.$executeRawUnsafe('ALTER TABLE "form_definitions" DISABLE TRIGGER USER');
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "notifications", "email_outbox", "rate_limit_hits", "form_submission_events", "form_submissions", "form_definitions", "stored_files", "user_roles" CASCADE',
  );
  await db.$executeRawUnsafe('ALTER TABLE "form_definitions" ENABLE TRIGGER USER');
  await db.user.deleteMany();
  await user("admin", "sysadmin");
  await user("sec", "secretary");
  await user("fin", "finance");
  await user("stu", "student");
  actorId = "admin";
});

describe("public submissions (AC-4..AC-6)", () => {
  it("validates, stores with a reference, the version and the initial state, and keeps no IP", async () => {
    await publishForm("kerkese", "PUBLIC");
    const r = await subs.submitPublic(
      "kerkese",
      { name: " Ana ", kind: "a", extra: "dropped", other: "dropped too" },
      "203.0.113.9",
    );
    expect(r).toMatchObject({
      ok: true,
      reference: expect.stringMatching(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/),
    });
    const row = await db.formSubmission.findFirstOrThrow({
      include: { events: true, definition: true },
    });
    expect(row).toMatchObject({
      state: "new",
      submitterId: null,
      answers: { name: "Ana", kind: "a" },
    });
    expect(row.definition.version).toBe(1);
    expect(row.events).toMatchObject([{ kind: "SUBMITTED", toState: "new" }]);
    expect(JSON.stringify(row)).not.toContain("203.0.113");
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "plt.form_submission.create" },
    });
    expect(audit.actorType).toBe("PUBLIC");
  });

  it("returns field errors and stores nothing; hidden required fields count when visible", async () => {
    await publishForm("kerkese", "PUBLIC");
    expect(await subs.submitPublic("kerkese", {}, "1.1.1.1")).toEqual({
      ok: false,
      code: "VALIDATION",
      errors: { name: "required" },
    });
    expect(await subs.submitPublic("kerkese", { name: "A", kind: "b" }, "1.1.1.1")).toEqual({
      ok: false,
      code: "VALIDATION",
      errors: { other: "required" },
    });
    expect(await db.formSubmission.count()).toBe(0);
  });

  it("answers 404-like for unknown, unpublished and authenticated forms", async () => {
    expect(await subs.submitPublic("nope", { name: "A" }, null)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    await publishForm("intern", "AUTHENTICATED");
    expect(await subs.submitPublic("intern", { name: "A" }, null)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
  });

  it("treats a filled honeypot as a success that stores nothing", async () => {
    await publishForm("kerkese", "PUBLIC");
    const r = await subs.submitPublic(
      "kerkese",
      { name: "Bot", company_website: "http://spam" },
      "9.9.9.9",
    );
    expect(r.ok).toBe(true);
    expect(await db.formSubmission.count()).toBe(0);
  });

  it("limits to 5 submissions per IP and form per window", async () => {
    await publishForm("kerkese", "PUBLIC");
    for (let i = 0; i < 5; i++)
      expect((await subs.submitPublic("kerkese", { name: `A${i}` }, "5.5.5.5")).ok).toBe(true);
    expect(await subs.submitPublic("kerkese", { name: "A6" }, "5.5.5.5")).toEqual({
      ok: false,
      code: "RATE_LIMITED",
    });
    expect((await subs.submitPublic("kerkese", { name: "other ip" }, "6.6.6.6")).ok).toBe(true);
    expect(await db.formSubmission.count()).toBe(6);
  });
});

describe("authenticated submissions (AC-4, AC-5)", () => {
  it("stores the submitter and refuses public forms and unknown keys", async () => {
    await publishForm("intern", "AUTHENTICATED");
    await publishForm("kerkese", "PUBLIC");
    actorId = "stu";
    const r = ok(
      await run((ctx) => subs.submitAuthenticated(ctx, "intern", { name: "Ana", kind: "a" })),
    );
    expect(
      await db.formSubmission.findUniqueOrThrow({ where: { id: r.submissionId } }),
    ).toMatchObject({ submitterId: "stu", reference: r.reference });
    expect(
      await run((ctx) => subs.submitAuthenticated(ctx, "kerkese", { name: "x" })),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await run((ctx) => subs.submitAuthenticated(ctx, "intern", {}))).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
  });
});

describe("handling (AC-7..AC-10)", () => {
  async function submitted(extra: Record<string, unknown> = {}, roles = ["secretary"]) {
    await publishForm("intern", "AUTHENTICATED", extra, roles);
    actorId = "stu";
    const r = ok(
      await run((ctx) => subs.submitAuthenticated(ctx, "intern", { name: "Ana", kind: "a" })),
    );
    actorId = "sec";
    return r.submissionId;
  }

  it("moves along allowed transitions with events, audit and a notification to the submitter", async () => {
    const id = await submitted();
    ok(await run((ctx) => subs.changeState(ctx, id, "review", "Po e shqyrtojmë")));
    expect(await run((ctx) => subs.changeState(ctx, id, "new", null))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(await run((ctx) => subs.changeState(ctx, id, "zzz", null))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    ok(await run((ctx) => subs.changeState(ctx, id, "approved", null)));
    expect(await run((ctx) => subs.changeState(ctx, id, "rejected", null))).toMatchObject({
      ok: false,
    }); // final
    const events = await db.formSubmissionEvent.findMany({
      where: { submissionId: id },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((e) => [e.kind, e.fromState, e.toState, e.comment])).toEqual([
      ["SUBMITTED", null, "new", null],
      ["STATE", "new", "review", "Po e shqyrtojmë"],
      ["STATE", "review", "approved", null],
    ]);
    const notes = await db.notification.findMany({
      where: { userId: "stu" },
      orderBy: { createdAt: "asc" },
    });
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ type: "plt.form-status", title: expect.any(String) });
    expect(notes[1]!.body).toContain("Miratuar");
    expect(await db.auditLog.count({ where: { action: "plt.form_submission.change_state" } })).toBe(
      2,
    );
  });

  it("runs the registered handler on approval inside the transaction; a failing or missing handler rolls back", async () => {
    const id = await submitted({ handler: "stu.deregistration" });
    ok(await run((ctx) => subs.changeState(ctx, id, "review", null)));
    // missing handler
    expect(await run((ctx) => subs.changeState(ctx, id, "approved", null))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect((await db.formSubmission.findUniqueOrThrow({ where: { id } })).state).toBe("review");
    // failing handler
    registerFormHandler("stu.deregistration", {
      onApproved: async () => {
        throw new Error("boom");
      },
    });
    expect(await run((ctx) => subs.changeState(ctx, id, "approved", null))).toMatchObject({
      ok: false,
    });
    expect((await db.formSubmission.findUniqueOrThrow({ where: { id } })).state).toBe("review");
    // working handler, called with the answers
    const seen: unknown[] = [];
    registerFormHandler("stu.deregistration", {
      onApproved: async (_ctx, s) => void seen.push([s.formKey, s.answers, s.submitterId]),
    });
    ok(await run((ctx) => subs.changeState(ctx, id, "approved", null)));
    expect(seen).toEqual([["intern", { name: "Ana", kind: "a" }, "stu"]]);
    // rejection does not run the handler
  });

  it("limits the inbox to the form's owner roles and the sysadmin", async () => {
    const id = await submitted({}, ["secretary"]);
    expect(await db.formSubmission.count({ where: await inboxWhere("sec") })).toBe(1);
    expect(await db.formSubmission.count({ where: await inboxWhere("admin") })).toBe(1);
    expect(await db.formSubmission.count({ where: await inboxWhere("fin") })).toBe(0);
    expect(await db.formSubmission.count({ where: await inboxWhere("stu") })).toBe(0);
    expect(await getSubmission("fin", id)).toBeNull();
    expect((await getSubmission("sec", id))?.submission.reference).toBeTruthy();
    // someone outside the owner roles cannot act on it: it does not exist for them
    actorId = "fin";
    expect(await run((ctx) => subs.changeState(ctx, id, "review", null))).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(await run((ctx) => subs.addComment(ctx, id, "hello"))).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("assigns to a user who can handle the form and comments", async () => {
    const id = await submitted();
    ok(await run((ctx) => subs.assign(ctx, id, "sec")));
    expect((await db.formSubmission.findUniqueOrThrow({ where: { id } })).assigneeId).toBe("sec");
    expect(await run((ctx) => subs.assign(ctx, id, "fin"))).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expect(await run((ctx) => subs.assign(ctx, id, "stu"))).toMatchObject({ ok: false });
    ok(await run((ctx) => subs.assign(ctx, id, null)));
    ok(await run((ctx) => subs.addComment(ctx, id, "Mungon një dokument")));
    const kinds = (
      await db.formSubmissionEvent.findMany({
        where: { submissionId: id },
        orderBy: { createdAt: "asc" },
      })
    ).map((e) => e.kind);
    expect(kinds).toEqual(["SUBMITTED", "ASSIGNED", "ASSIGNED", "COMMENT"]);
  });
});
