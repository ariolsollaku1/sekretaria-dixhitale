import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { can } from "@/lib/authz/guard";
import { db, withTransaction } from "@/lib/db";
import { HONEYPOT_FIELD, submitPublic } from "@/lib/forms/submission.service";
import "@/modules/org";
import "@/modules/adm";
import { INTEREST_FORM } from "../domain/interest-form";
import type { Permission } from "@/lib/authz/types";
import * as leads from "./lead.service";

let actorId = "sa-1";
function run<R>(
  fn: (ctx: ActionContext) => Promise<R>,
  permission: Permission = "adm.lead.write",
): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => ({
      id: actorId,
      email: `${actorId}@t.test`,
      name: actorId,
      locale: null,
      personId: null,
    }),
    can,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission,
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};
const message = <T>(r: ActionResult<T>): string => (r.ok ? "ok" : r.error.message);

let progId: string;

async function mkUser(
  id: string,
  role: "sysadmin" | "secretary" | "student_affairs" | "finance" | "student",
) {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id } });
  await db.userRole.create({
    data: { userId: id, role, scopeType: role === "student" ? "SELF" : "INSTITUTION" },
  });
}

const base = {
  firstName: "Ana",
  lastName: "Koci",
  email: "ana@x.test",
  phone: null,
  programId: null,
  programNote: null,
  message: null,
  source: "EVENT" as const,
  sourceNote: "Open day",
  consent: true,
};

beforeEach(async () => {
  await db.$executeRawUnsafe('ALTER TABLE "form_definitions" DISABLE TRIGGER USER');
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "email_outbox", "rate_limit_hits", "lead_events", "leads", "form_submission_events", "form_submissions", "form_definitions", "user_roles", "study_programs", "departments", "faculties" CASCADE',
  );
  await db.$executeRawUnsafe('ALTER TABLE "form_definitions" ENABLE TRIGGER USER');
  await db.user.deleteMany();
  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  const d = await db.department.create({ data: { code: "D", name: "D", facultyId: f.id } });
  progId = (
    await db.studyProgram.create({
      data: {
        departmentId: d.id,
        cycle: "FIRST",
        code: "BSC-INF",
        name: "Informatikë",
        nameEn: "Informatics",
        durationYears: 3,
        totalCredits: 180,
      },
    })
  ).id;
  actorId = "sa-1";
  await mkUser("sa-1", "student_affairs");
  await mkUser("sa-2", "secretary");
  await mkUser("fin-1", "finance");
  await mkUser("admin", "sysadmin");
  await mkUser("stu-1", "student");
  await db.formDefinition.create({
    data: {
      key: INTEREST_FORM.key,
      version: 1,
      status: "PUBLISHED",
      audience: "PUBLIC",
      ownerRoles: [...INTEREST_FORM.ownerRoles],
      definition: INTEREST_FORM.definition as never,
      publishedAt: new Date(),
    },
  });
});

describe("public interest form (AC-2)", () => {
  const answers = {
    firstName: " Blerta ",
    lastName: "Hoxha",
    email: "Blerta@X.test",
    phone: "+355 69 000",
    program: "bsc-inf",
    message: "Dua informacion",
    consent: true,
  };
  it("creates a lead with consent time, submission link and matched program", async () => {
    const res = await submitPublic("interest", answers, "1.2.3.4");
    expect(res.ok).toBe(true);
    const lead = await db.lead.findFirstOrThrow({ include: { events: true } });
    expect(lead).toMatchObject({
      firstName: "Blerta",
      lastName: "Hoxha",
      email: "blerta@x.test",
      source: "WEBSITE",
      status: "NEW",
      consent: true,
      programId: progId,
      programNote: "bsc-inf",
    });
    expect(lead.consentAt).toBeInstanceOf(Date);
    const sub = await db.formSubmission.findFirstOrThrow();
    expect(lead.submissionId).toBe(sub.id);
    expect(lead.events.map((e) => e.kind)).toEqual(["CREATED"]);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "adm.lead.create" } });
    expect(JSON.stringify(audit)).not.toContain("blerta");
  });
  it("matches by name and leaves an unknown program unlinked", async () => {
    await submitPublic("interest", { ...answers, program: "Informatics" }, "1.2.3.4");
    await submitPublic(
      "interest",
      { ...answers, email: "b@x.test", program: "Drejtësi" },
      "1.2.3.5",
    );
    const rows = await db.lead.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows[0]!.programId).toBe(progId);
    expect(rows[1]!.programId).toBeNull();
    expect(rows[1]!.programNote).toBe("Drejtësi");
  });
  it("stores nothing for a visitor who did not consent (form validation) or a honeypot hit", async () => {
    const r = await submitPublic("interest", { ...answers, consent: false }, "1.2.3.4");
    expect(r.ok).toBe(false);
    const bot = await submitPublic(
      "interest",
      { ...answers, [HONEYPOT_FIELD]: "http://spam" },
      "1.2.3.4",
    );
    expect(bot.ok).toBe(true);
    expect(await db.lead.count()).toBe(0);
  });
});

describe("manual entry and editing (AC-3, AC-7, AC-9)", () => {
  it("creates a lead with an event and an audit entry free of personal data", async () => {
    const { leadId } = ok(
      await run((ctx) => leads.createLead(ctx, { ...base, programId: progId })),
    );
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead).toMatchObject({
      status: "NEW",
      consent: true,
      programId: progId,
      createdById: "sa-1",
    });
    expect(lead.consentAt).not.toBeNull();
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "adm.lead.create" } });
    expect(JSON.stringify(audit)).not.toMatch(/ana|koci/i);
  });
  it("refuses an inactive or unknown program", async () => {
    await db.studyProgram.update({ where: { id: progId }, data: { active: false } });
    const r = await run((ctx) => leads.createLead(ctx, { ...base, programId: progId }));
    expect(r.ok).toBe(false);
    const r2 = await run((ctx) => leads.createLead(ctx, { ...base, programId: "nope" }));
    expect(message(r2)).toBe("Program not found");
  });
  it("edits only what changed and records the field names", async () => {
    const { leadId } = ok(await run((ctx) => leads.createLead(ctx, base)));
    ok(
      await run((ctx) =>
        leads.updateLead(ctx, { ...base, leadId, phone: "+355", lastName: "Dosi" }),
      ),
    );
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead).toMatchObject({ lastName: "Dosi", phone: "+355" });
    const ev = await db.leadEvent.findFirstOrThrow({ where: { leadId, kind: "EDITED" } });
    expect(ev.body).toBe("lastName, phone");
    // no change, no event
    ok(
      await run((ctx) =>
        leads.updateLead(ctx, { ...base, leadId, phone: "+355", lastName: "Dosi" }),
      ),
    );
    expect(await db.leadEvent.count({ where: { leadId, kind: "EDITED" } })).toBe(1);
  });
  it("adds append-only notes", async () => {
    const { leadId } = ok(await run((ctx) => leads.createLead(ctx, base)));
    ok(await run((ctx) => leads.addLeadNote(ctx, leadId, "Called, no answer")));
    const ev = await db.leadEvent.findFirstOrThrow({ where: { leadId, kind: "NOTE" } });
    expect(ev).toMatchObject({ body: "Called, no answer", actorId: "sa-1" });
  });
});

describe("status changes (AC-6)", () => {
  it("follows the transitions, stores events and needs a reason for LOST", async () => {
    const { leadId } = ok(await run((ctx) => leads.createLead(ctx, base)));
    const change = (to: "NEW" | "CONTACTED" | "APPLIED" | "LOST", reason: string | null = null) =>
      run((ctx) => leads.changeLeadStatus(ctx, { leadId, to, reason }));
    ok(await change("CONTACTED"));
    expect(message(await change("NEW"))).toBe("TRANSITION_NOT_ALLOWED");
    const noReason = await change("LOST");
    expect(noReason.ok).toBe(false);
    ok(await change("LOST", "Chose another college"));
    const lost = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lost).toMatchObject({ status: "LOST", lostReason: "Chose another college" });
    ok(await change("NEW"));
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).lostReason).toBeNull();
    const events = await db.leadEvent.findMany({
      where: { leadId, kind: "STATUS" },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((e) => `${e.fromStatus}>${e.toStatus}`)).toEqual([
      "NEW>CONTACTED",
      "CONTACTED>LOST",
      "LOST>NEW",
    ]);
    ok(await change("APPLIED"));
    expect(message(await change("LOST", "x"))).toBe("TRANSITION_NOT_ALLOWED");
  });
});

describe("assignment (AC-7)", () => {
  it("accepts a writer and refuses finance, a student, an inactive or unknown user", async () => {
    const { leadId } = ok(await run((ctx) => leads.createLead(ctx, base)));
    ok(await run((ctx) => leads.assignLead(ctx, leadId, "sa-2")));
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).assigneeId).toBe("sa-2");
    for (const who of ["fin-1", "stu-1", "ghost", "admin"]) {
      expect((await run((ctx) => leads.assignLead(ctx, leadId, who))).ok).toBe(false);
    }
    await db.user.update({ where: { id: "sa-1" }, data: { active: false } });
    expect((await run((ctx) => leads.assignLead(ctx, leadId, "sa-1"))).ok).toBe(false);
    actorId = "sa-2";
    ok(await run((ctx) => leads.assignLead(ctx, leadId, null)));
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).assigneeId).toBeNull();
  });
});

describe("invitation (AC-8)", () => {
  it("queues one e-mail, records the time and moves a NEW lead to CONTACTED", async () => {
    const { leadId } = ok(
      await run((ctx) => leads.createLead(ctx, { ...base, programId: progId })),
    );
    const { outboxId } = ok(await run((ctx) => leads.inviteLead(ctx, leadId)));
    const out = await db.emailOutbox.findUniqueOrThrow({ where: { id: outboxId } });
    expect(out).toMatchObject({
      toAddress: "ana@x.test",
      status: "QUEUED",
      type: "adm.lead-invitation",
    });
    expect(out.text).toContain("Informatikë");
    expect(out.text).toContain("Ana");
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead).toMatchObject({ status: "CONTACTED", invitedById: "sa-1" });
    expect(lead.invitedAt).not.toBeNull();
    // a second invitation is allowed and keeps the status
    ok(await run((ctx) => leads.inviteLead(ctx, leadId)));
    expect(await db.emailOutbox.count()).toBe(2);
    expect(await db.leadEvent.count({ where: { leadId, kind: "INVITED" } })).toBe(2);
  });
  it("refuses without e-mail, without consent, or when finished", async () => {
    const noMail = ok(
      await run((ctx) => leads.createLead(ctx, { ...base, email: null, phone: "+355" })),
    ).leadId;
    expect(message(await run((ctx) => leads.inviteLead(ctx, noMail)))).toBe("NO_EMAIL");
    const noConsent = ok(
      await run((ctx) => leads.createLead(ctx, { ...base, consent: false })),
    ).leadId;
    expect(message(await run((ctx) => leads.inviteLead(ctx, noConsent)))).toBe("NO_CONSENT");
    const lost = ok(
      await run((ctx) => leads.createLead(ctx, { ...base, email: "l@x.test" })),
    ).leadId;
    ok(await run((ctx) => leads.changeLeadStatus(ctx, { leadId: lost, to: "LOST", reason: "x" })));
    expect(message(await run((ctx) => leads.inviteLead(ctx, lost)))).toBe("FINISHED");
    expect(await db.emailOutbox.count()).toBe(0);
  });
});

describe("CSV import (AC-4)", () => {
  const header = "firstName,lastName,email,phone,program,consent\n";
  const input = (csv: string) => ({ csv, source: "EVENT" as const, sourceNote: "Open day" });
  it("imports all valid rows with the chosen source, matches programs and skips known e-mails", async () => {
    ok(
      await run((ctx) =>
        leads.createLead(ctx, { ...base, firstName: "Old", email: "known@x.test" }),
      ),
    );
    const csv =
      header +
      "Ana,Koci,ana@x.test,,BSC-INF,po\n" +
      "Ben,Lala,known@x.test,,,\n" +
      "Cia,Dosi,ANA@x.test,,,\n" +
      "Dea,Gjoni,,+355,Unknown,\n";
    const r = ok(await run((ctx) => leads.importLeads(ctx, input(csv))));
    expect(r).toEqual({ ok: true, imported: 2, skipped: 2 });
    const rows = await db.lead.findMany({
      where: { sourceNote: "Open day", firstName: { in: ["Ana", "Dea"] } },
      orderBy: { firstName: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      source: "EVENT",
      consent: true,
      programId: progId,
      status: "NEW",
    });
    expect(rows[0]!.consentAt).not.toBeNull();
    expect(rows[1]).toMatchObject({
      consent: false,
      programId: null,
      programNote: "Unknown",
      phone: "+355",
    });
    expect(await db.leadEvent.count({ where: { kind: "CREATED" } })).toBe(3);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "adm.lead.import" } });
    expect(JSON.stringify(audit)).not.toMatch(/ana|koci/i);
  });
  it("imports nothing when a row is invalid, and reports the lines", async () => {
    const before = await db.lead.count();
    const r = ok(
      await run((ctx) =>
        leads.importLeads(
          ctx,
          input(header + "Ana,Koci,ana@x.test,,,\n,Lala,b@x.test,,,\nCia,Dosi,bad,,,\n"),
        ),
      ),
    );
    expect(r).toEqual({
      ok: false,
      errors: [
        { line: 3, code: "nameRequired" },
        { line: 4, code: "invalidEmail" },
      ],
    });
    expect(await db.lead.count()).toBe(before);
  });
  it("reports file-level problems", async () => {
    const r = ok(await run((ctx) => leads.importLeads(ctx, input("a,b\n1,2\n"))));
    expect(r).toEqual({ ok: false, fileError: "missingColumns" });
  });
});

describe("permissions (AC-9, AC-10)", () => {
  it("lets every reader read but only the Secretariat and Student Affairs write", async () => {
    for (const who of ["sa-1", "sa-2", "fin-1", "admin"]) {
      actorId = who;
      expect((await run(async () => 1, "adm.lead.read")).ok).toBe(true);
    }
    actorId = "stu-1";
    const denied = await run(async () => 1, "adm.lead.read");
    expect(denied.ok).toBe(false);
    for (const who of ["fin-1", "admin", "stu-1"]) {
      actorId = who;
      const r = await run((ctx) => leads.createLead(ctx, base), "adm.lead.write");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("FORBIDDEN");
    }
    expect(await db.lead.count()).toBe(0);
    actorId = "sa-2";
    expect((await run((ctx) => leads.createLead(ctx, base))).ok).toBe(true);
  });
});
