import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import { getPublishedForm, listAuthenticatedForms } from "@/lib/forms/queries";
import "@/modules/org";
import "@/modules/hr";
import { openCampaignSchema } from "../domain/evaluation-schemas";
import { getCampaignView, myEvaluations, ownResults } from "./evaluation.queries";
import * as svc from "./evaluation.service";

type U = { id: string; email: string; name: string; locale: null; personId: string | null };
const d = (s: string) => new Date(`${s}T00:00:00Z`);

function run<R>(user: U, fn: (ctx: ActionContext) => Promise<R>): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => user,
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "hr.evaluation.manage",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}

const QUESTIONNAIRE = {
  title: { sq: "Vlerësim", en: "Evaluation" },
  fields: [
    {
      key: "teaching",
      type: "radio",
      label: { sq: "Mësimdhënia" },
      required: true,
      options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: { sq: String(n) } })),
    },
    { key: "research", type: "number", label: { sq: "Kërkimi" }, integer: true, min: 1, max: 5 },
    { key: "comment", type: "textarea", label: { sq: "Koment" } },
  ],
  workflow: {
    initial: "new",
    states: [{ key: "new", label: { sq: "E re" }, kind: "approved", final: true }],
    transitions: [],
  },
};

async function publish(key: string) {
  return db.formDefinition.create({
    data: {
      key,
      version: 1,
      status: "PUBLISHED",
      audience: "AUTHENTICATED",
      ownerRoles: ["hr"],
      definition: QUESTIONNAIRE,
      publishedAt: new Date(),
    },
  });
}

let f1: string, f2: string, dep1: string, dep2: string, dep3: string;
let hr: U, head1: U, headSelf: U, lect: U, student: U;
let sLect: string, sSelf: string, sD2a: string, sD2b: string, sNoDept: string, sAdmin: string;

async function user(name: string, role?: string, scope?: { type: "DEPARTMENT"; id: string }) {
  const person = await db.person.create({
    data: {
      firstName: name,
      lastName: "T",
      gender: "MALE",
      birthDate: d("1980-01-01"),
      email: `${name}@t.test`,
    },
  });
  const u = await db.user.create({
    data: { email: `${name}@t.test`, name, personId: person.id },
  });
  if (role)
    await db.userRole.create({
      data: {
        userId: u.id,
        role: role as never,
        scopeType: scope ? scope.type : "INSTITUTION",
        scopeId: scope?.id ?? null,
      },
    });
  return { u: { id: u.id, email: u.email, name, locale: null, personId: person.id } as U, person };
}

async function staff(
  personId: string,
  departmentId: string | null,
  over: { kind?: "ACADEMIC" | "ADMINISTRATIVE"; active?: boolean } = {},
) {
  return (
    await db.staff.create({
      data: {
        personId,
        departmentId,
        kind: over.kind ?? "ACADEMIC",
        category: "PAE",
        contractStart: d("2020-01-01"),
        active: over.active ?? true,
      },
    })
  ).id;
}

async function plainStaffPerson(name: string) {
  return db.person.create({
    data: {
      firstName: name,
      lastName: "S",
      gender: "FEMALE",
      birthDate: d("1985-01-01"),
      email: `${name}@s.test`,
    },
  });
}

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "evaluations", "evaluation_campaigns", "form_definitions", "notifications", "staff", "user_roles", "departments", "faculties" CASCADE',
  );
  await db.user.deleteMany();
  await db.person.deleteMany();
  f1 = (await db.faculty.create({ data: { code: "F1", name: "F1" } })).id;
  f2 = (await db.faculty.create({ data: { code: "F2", name: "F2" } })).id;
  dep1 = (await db.department.create({ data: { code: "D1", name: "D1", facultyId: f1 } })).id;
  dep2 = (await db.department.create({ data: { code: "D2", name: "D2", facultyId: f2 } })).id;
  dep3 = (await db.department.create({ data: { code: "D3", name: "D3", facultyId: f1 } })).id;

  hr = (await user("hr1", "hr")).u;
  student = (await user("stud", "student")).u;
  head1 = (await user("head1", "head_of_department", { type: "DEPARTMENT", id: dep1 })).u;
  // a second head in dep3 -> ambiguous, left to HR
  await user("head3a", "head_of_department", { type: "DEPARTMENT", id: dep3 });
  await user("head3b", "head_of_department", { type: "DEPARTMENT", id: dep3 });
  // a head of dep2 who is also a lecturer of dep2 (cannot evaluate themselves)
  const selfHead = await user("head2", "head_of_department", { type: "DEPARTMENT", id: dep2 });
  headSelf = selfHead.u;
  sSelf = await staff(selfHead.person.id, dep2);

  const l = await user("lect", "lecturer");
  lect = l.u;
  sLect = await staff(l.person.id, dep1);
  sD2a = await staff((await plainStaffPerson("d2a")).id, dep2);
  sD2b = await staff((await plainStaffPerson("d2b")).id, dep3);
  sNoDept = await staff((await plainStaffPerson("nodept")).id, null);
  await staff((await plainStaffPerson("gone")).id, dep1, { active: false });
  sAdmin = await staff((await plainStaffPerson("admin")).id, dep1, { kind: "ADMINISTRATIVE" });
});

const open = (over: Record<string, unknown> = {}) =>
  run(hr, (ctx) =>
    svc.openCampaign(
      ctx,
      openCampaignSchema.parse({
        name: "2026",
        kind: "LECTURER",
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        ...over,
      }),
    ),
  );
const openOk = async (over: Record<string, unknown> = {}) => {
  const r = await open(over);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data.id;
};

describe("internal questionnaires (AC-1)", () => {
  it("are not served as forms nor listed in the catalog", async () => {
    await publish("hr-evaluation-lecturer");
    await publish("ordinary");
    expect(await getPublishedForm("hr-evaluation-lecturer")).toBeNull();
    expect(await getPublishedForm("ordinary")).not.toBeNull();
    expect((await listAuthenticatedForms()).map((f) => f.key)).toEqual(["ordinary"]);
  });
});

describe("openCampaign (AC-2, AC-11)", () => {
  it("refuses without a published questionnaire", async () => {
    const r = await open();
    expect(r).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: { kind: ["noQuestionnaire"] } },
    });
    expect(await db.evaluationCampaign.count()).toBe(0);
  });

  it("creates one evaluation per active academic staff member and assigns single heads", async () => {
    const form = await publish("hr-evaluation-lecturer");
    const id = await openOk();
    const campaign = await db.evaluationCampaign.findUniqueOrThrow({ where: { id } });
    expect(campaign.formDefinitionId).toBe(form.id);
    const rows = await db.evaluation.findMany({ where: { campaignId: id } });
    // 4 academic active + head2 himself; the inactive and the administrative one are not included
    expect(rows.map((r) => r.staffId).sort()).toEqual([sLect, sSelf, sD2a, sD2b, sNoDept].sort());
    const by = Object.fromEntries(rows.map((r) => [r.staffId, r.evaluatorId]));
    expect(by[sLect]).toBe(head1.id); // dep1 has one head
    expect(by[sD2a]).toBe(headSelf.id); // dep2 has one head
    expect(by[sSelf]).toBeNull(); // the head of dep2 is the evaluated person
    expect(by[sD2b]).toBeNull(); // dep3: two heads
    expect(by[sNoDept]).toBeNull(); // no department
    expect(rows.every((r) => r.state === "PENDING")).toBe(true);
    expect(await db.notification.count({ where: { type: "hr.evaluation" } })).toBe(2);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "hr.evaluation.open" },
    });
    expect(audit.entityId).toBe(id);
  });

  it("covers administrative staff for a STAFF campaign without default evaluators", async () => {
    await publish("hr-evaluation-staff");
    const id = await openOk({ kind: "STAFF" });
    const rows = await db.evaluation.findMany({ where: { campaignId: id } });
    expect(rows.map((r) => r.staffId)).toEqual([sAdmin]);
    expect(rows[0]!.evaluatorId).toBeNull();
  });

  it("rejects an inverted period at the schema", () => {
    const r = openCampaignSchema.safeParse({
      name: "x",
      kind: "STAFF",
      periodStart: "2026-02-01",
      periodEnd: "2026-01-01",
    });
    expect(r.success).toBe(false);
  });
});

describe("assignEvaluator (AC-3)", () => {
  it("assigns staff-role users, refuses students, the person themselves and closed campaigns", async () => {
    await publish("hr-evaluation-lecturer");
    const id = await openOk();
    const ev = await db.evaluation.findFirstOrThrow({
      where: { campaignId: id, staffId: sNoDept },
    });
    const assign = (evaluatorId: string, evaluationId = ev.id) =>
      run(hr, (ctx) => svc.assignEvaluator(ctx, { evaluationId, evaluatorId }));

    expect(await assign(student.id)).toMatchObject({
      ok: false,
      error: { fieldErrors: { evaluatorId: ["unknownEvaluator"] } },
    });
    expect(await assign("nobody")).toMatchObject({ ok: false });

    const own = await db.evaluation.findFirstOrThrow({ where: { campaignId: id, staffId: sSelf } });
    expect(await assign(headSelf.id, own.id)).toMatchObject({
      ok: false,
      error: { fieldErrors: { evaluatorId: ["selfEvaluation"] } },
    });

    expect(await assign(head1.id)).toMatchObject({ ok: true });
    expect((await db.evaluation.findUniqueOrThrow({ where: { id: ev.id } })).evaluatorId).toBe(
      head1.id,
    );
    expect(await db.auditLog.count({ where: { action: "hr.evaluation.assign" } })).toBe(1);

    await run(hr, (ctx) => svc.closeCampaign(ctx, { campaignId: id }));
    expect(await assign(lect.id)).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });
});

describe("submitEvaluation (AC-4..AC-7)", () => {
  async function setup() {
    await publish("hr-evaluation-lecturer");
    const id = await openOk();
    const ev = await db.evaluation.findFirstOrThrow({ where: { campaignId: id, staffId: sLect } });
    return { id, ev };
  }
  const submit = (u: U, evaluationId: string, answers: Record<string, unknown>) =>
    run(u, (ctx) => svc.submitEvaluation(ctx, { evaluationId, answers }));

  it("validates, scores, stores and audits; the evaluator may correct while open", async () => {
    const { ev } = await setup();
    const bad = await submit(head1, ev.id, { research: 4 });
    expect(bad).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: { teaching: ["required"] } },
    });
    expect((await db.evaluation.findUniqueOrThrow({ where: { id: ev.id } })).state).toBe("PENDING");

    const ok = await submit(head1, ev.id, { teaching: "5", research: 4, comment: "Good" });
    expect(ok).toMatchObject({ ok: true, data: { score: 4.5 } });
    const row = await db.evaluation.findUniqueOrThrow({ where: { id: ev.id } });
    expect(row.state).toBe("SUBMITTED");
    expect(Number(row.score)).toBe(4.5);
    expect(row.answers).toMatchObject({ teaching: "5", research: 4, comment: "Good" });
    expect(row.submittedAt).not.toBeNull();

    // correction while open
    expect(await submit(head1, ev.id, { teaching: "3" })).toMatchObject({
      ok: true,
      data: { score: 3 },
    });
    expect(await db.auditLog.count({ where: { action: "hr.evaluation.submit" } })).toBe(2);
    // the audit trail keeps scores, not the free-text comments
    const audits = await db.auditLog.findMany({ where: { action: "hr.evaluation.submit" } });
    expect(JSON.stringify(audits)).not.toContain("Good");
  });

  it("refuses everyone but the assigned evaluator, as if it did not exist", async () => {
    const { ev } = await setup();
    for (const u of [hr, lect, student]) {
      expect(await submit(u, ev.id, { teaching: "4" })).toMatchObject({
        ok: false,
        error: { code: "NOT_FOUND" },
      });
    }
    expect((await db.evaluation.findUniqueOrThrow({ where: { id: ev.id } })).state).toBe("PENDING");
  });

  it("refuses a person who is both evaluator and evaluated", async () => {
    const { ev } = await setup();
    // force the assignment as a data fix: the person behind the evaluator is the evaluated one
    await db.evaluation.update({ where: { id: ev.id }, data: { evaluatorId: lect.id } });
    expect(await submit(lect, ev.id, { teaching: "4" })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("changes nothing after the campaign is closed, which cannot reopen or close twice", async () => {
    const { id, ev } = await setup();
    await submit(head1, ev.id, { teaching: "4" });
    expect(await run(hr, (ctx) => svc.closeCampaign(ctx, { campaignId: id }))).toMatchObject({
      ok: true,
    });
    expect(await submit(head1, ev.id, { teaching: "1" })).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(Number((await db.evaluation.findUniqueOrThrow({ where: { id: ev.id } })).score)).toBe(4);
    expect(await run(hr, (ctx) => svc.closeCampaign(ctx, { campaignId: id }))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(await db.auditLog.count({ where: { action: "hr.evaluation.close" } })).toBe(1);
  });
});

describe("queries (AC-4, AC-8, AC-9, AC-10)", () => {
  it("lists my open evaluations", async () => {
    await publish("hr-evaluation-lecturer");
    await openOk();
    const mine = await myEvaluations(head1.id);
    expect(mine.map((m) => m.name)).toEqual(["T lect"]);
    expect(await myEvaluations(student.id)).toEqual([]);
  });

  it("limits the view and the report to the reader's scope", async () => {
    await publish("hr-evaluation-lecturer");
    const id = await openOk();
    const ev = await db.evaluation.findFirstOrThrow({ where: { campaignId: id, staffId: sLect } });
    await run(head1, (ctx) =>
      svc.submitEvaluation(ctx, { evaluationId: ev.id, answers: { teaching: "4", research: 5 } }),
    );

    const all = await getCampaignView(hr, id);
    expect(all!.evaluations).toHaveLength(5);
    expect(all!.report.institution[0]).toMatchObject({ total: 5, submitted: 1, average: 4.5 });
    expect(all!.report.department.map((g) => g.key)).toEqual(["", "D1", "D2", "D3"]);
    expect(all!.report.faculty.map((g) => g.key)).toEqual(["", "F1", "F2"]);

    const own = await getCampaignView(head1, id);
    expect(own!.evaluations.map((e) => e.name)).toEqual(["T lect"]);
    expect(own!.report.department).toEqual([
      { key: "D1", total: 1, submitted: 1, scored: 1, average: 4.5 },
    ]);
    expect(own!.campaign).toMatchObject({ total: 1, submitted: 1 });

    // a user without evaluation read sees nothing of the evaluations
    const none = await getCampaignView(lect, id);
    expect(none!.evaluations).toHaveLength(0);
    expect(await getCampaignView(hr, "missing")).toBeNull();
  });

  it("shows an own result only when the flag is set and the campaign is closed", async () => {
    await publish("hr-evaluation-lecturer");
    const hidden = await openOk({ name: "hidden" });
    const shown = await openOk({ name: "shown", resultsVisible: true });
    for (const campaignId of [hidden, shown]) {
      const ev = await db.evaluation.findFirstOrThrow({ where: { campaignId, staffId: sLect } });
      await run(head1, (ctx) =>
        svc.submitEvaluation(ctx, { evaluationId: ev.id, answers: { teaching: "5" } }),
      );
    }
    expect(await ownResults(lect.id, "sq")).toEqual([]); // still open
    await run(hr, (ctx) => svc.closeCampaign(ctx, { campaignId: hidden }));
    await run(hr, (ctx) => svc.closeCampaign(ctx, { campaignId: shown }));
    const results = await ownResults(lect.id, "sq");
    expect(results.map((r) => r.campaignName)).toEqual(["shown"]);
    expect(results[0]).toMatchObject({ score: 5 });
    expect(results[0]!.lines.map((l) => l.label)).toContain("Mësimdhënia");
    expect(await ownResults(head1.id, "sq")).toEqual([]); // no staff record
    expect(await ownResults(student.id, "sq")).toEqual([]);
  });
});
