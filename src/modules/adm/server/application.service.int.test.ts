import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { can } from "@/lib/authz/guard";
import { db, withTransaction } from "@/lib/db";
import { LocalStorage } from "@/lib/storage/local";
import { setStorage } from "@/lib/storage";
import "@/modules/org";
import "../permissions";
import { cycleSchema, type CycleInput } from "../domain/schemas";
import { registerAdmPurposes } from "./purposes";
import * as applications from "./application.service";
import { applicationsTable } from "./application.table";
import { listCycles, openOffer } from "./application.queries";
import * as cycles from "./cycle.service";

const NOW = new Date("2026-07-01T10:00:00Z");
const IP = "203.0.113.7";
const PDF = new TextEncoder().encode("%PDF-1.7 test document");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

let dir: string;
let yearId: string, progId: string, cycleId: string;

function run<R>(fn: (ctx: ActionContext) => Promise<R>): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => ({
      id: "sec",
      email: "sec@t.test",
      name: "sec",
      locale: null,
      personId: null,
    }),
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "adm.cycle.write",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};
const fields = (r: ActionResult<unknown>) => (r.ok ? {} : (r.error.fieldErrors ?? {}));

const cycleInput = (over: Record<string, unknown> = {}): CycleInput =>
  cycleSchema.parse({
    academicYearId: yearId,
    name: "Round 1",
    opensOn: "2026-06-01",
    closesOn: "2026-09-15",
    active: true,
    documents: [
      { key: "diploma", labelSq: "Diploma", required: true },
      { key: "id-card", labelSq: "Letërnjoftimi", labelEn: "ID card", required: true },
      { key: "photo", labelSq: "Foto", required: false },
    ],
    ...over,
  });

const form = (over: Record<string, unknown> = {}) => ({
  cycleId,
  programId: progId,
  locale: "sq",
  firstName: "Ana",
  lastName: "Hoxha",
  gender: "FEMALE",
  birthDate: "2007-03-14",
  email: "Ana@Example.com",
  phone: "+355 69 000 0000",
  address: "Rr. Kavajes 1",
  schoolName: "Gjimnazi",
  graduationYear: "2025",
  averageGrade: "9.25",
  consent: true,
  ...over,
});
const submit = (over: Record<string, unknown> = {}, ip: string | null = IP) =>
  applications.submitApplication(form(over), ip, NOW);
async function submitOk(over: Record<string, unknown> = {}) {
  const r = await submit(over);
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r;
}
const upload = (token: string, key: string, bytes = PDF, ip: string | null = IP) =>
  applications.uploadDocument(
    token,
    key,
    { name: "my file.pdf", type: bytes === PNG ? "image/png" : "application/pdf", bytes },
    ip,
    NOW,
  );

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "adm-"));
  setStorage(new LocalStorage(dir));
  registerAdmPurposes();
});
afterAll(async () => {
  setStorage(undefined);
  await rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "application_documents", "applications", "application_cycle_documents", "application_cycles", "stored_files", "email_outbox", "rate_limit_hits", "user_roles", "study_programs", "departments", "faculties", "semesters", "academic_years", "system_settings" CASCADE',
  );
  await db.user.deleteMany();
  const f = await db.faculty.create({ data: { code: "F", name: "F" } });
  const dep = await db.department.create({ data: { code: "D1", name: "D1", facultyId: f.id } });
  progId = (
    await db.studyProgram.create({
      data: {
        departmentId: dep.id,
        cycle: "FIRST",
        code: "P1",
        name: "Program 1",
        durationYears: 3,
        totalCredits: 180,
      },
    })
  ).id;
  yearId = (
    await db.academicYear.create({
      data: {
        code: "2026-2027",
        startDate: new Date("2026-09-01T00:00:00Z"),
        endDate: new Date("2027-08-31T00:00:00Z"),
        status: "CURRENT",
      },
    })
  ).id;
  await db.user.create({ data: { id: "sec", email: "sec@t.test", name: "sec" } });
  cycleId = ok(await run((ctx) => cycles.saveCycle(ctx, cycleInput()))).cycleId;
});

describe("cycles (AC-1)", () => {
  it("creates a cycle with its document list and audits it", async () => {
    const [c] = await listCycles(NOW);
    expect(c).toMatchObject({ name: "Round 1", academicYear: "2026-2027", open: true });
    expect(c!.documents.map((d) => d.key)).toEqual(["diploma", "id-card", "photo"]);
    const audit = await db.auditLog.findFirst({ where: { action: "adm.cycle.create" } });
    expect(audit?.entityId).toBe(cycleId);
  });

  it("edits a cycle: reorders, adds and removes unused documents", async () => {
    ok(
      await run((ctx) =>
        cycles.saveCycle(
          ctx,
          cycleInput({
            cycleId,
            closesOn: "2026-06-30",
            documents: [{ key: "photo", labelSq: "Foto", required: true }],
          }),
        ),
      ),
    );
    const [c] = await listCycles(NOW);
    expect(c!.documents).toEqual([
      { key: "photo", labelSq: "Foto", labelEn: null, required: true },
    ]);
    expect(c!.open).toBe(false); // closed on 30 June
    expect(await db.auditLog.count({ where: { action: "adm.cycle.update" } })).toBe(1);
  });

  it("refuses a duplicate name in the year and a closed year", async () => {
    const dup = await run((ctx) => cycles.saveCycle(ctx, cycleInput()));
    expect(fields(dup)).toEqual({ name: ["duplicate"] });
    const closed = await db.academicYear.create({
      data: {
        code: "2020-2021",
        startDate: new Date("2020-09-01T00:00:00Z"),
        endDate: new Date("2021-08-31T00:00:00Z"),
        status: "CLOSED",
      },
    });
    const r = await run((ctx) =>
      cycles.saveCycle(ctx, cycleInput({ academicYearId: closed.id, name: "Old" })),
    );
    expect(r.ok).toBe(false);
  });

  it("refuses to remove a document type that has uploaded files", async () => {
    const { token } = await submitOk();
    expect((await upload(token, "diploma")).ok).toBe(true);
    const r = await run((ctx) =>
      cycles.saveCycle(
        ctx,
        cycleInput({ cycleId, documents: [{ key: "photo", labelSq: "Foto", required: false }] }),
      ),
    );
    expect(fields(r)).toEqual({ documents: ["inUse"] });
  });
});

describe("open offer (AC-2)", () => {
  it("lists open cycles and active programs only", async () => {
    expect((await openOffer(NOW)).cycles.map((c) => c.name)).toEqual(["Round 1"]);
    expect((await openOffer(NOW)).programs.map((p) => p.code)).toEqual(["P1"]);
    expect((await openOffer(new Date("2026-05-31T10:00:00Z"))).cycles).toEqual([]);
    expect((await openOffer(new Date("2026-09-16T10:00:00Z"))).cycles).toEqual([]);
    await db.applicationCycle.update({ where: { id: cycleId }, data: { active: false } });
    expect((await openOffer(NOW)).cycles).toEqual([]);
  });
});

describe("submitting an application (AC-3..AC-6)", () => {
  it("stores the application, audits it as PUBLIC and queues the e-mail", async () => {
    const r = await submitOk();
    expect(r.reference).toMatch(/^AP-[2-9A-HJKMNP-Z]{8}$/);
    const app = await db.application.findUniqueOrThrow({ where: { reference: r.reference } });
    expect(app).toMatchObject({
      status: "SUBMITTED",
      firstName: "Ana",
      emailKey: "ana@example.com",
      locale: "sq",
    });
    expect(app.averageGrade.toFixed(2)).toBe("9.25");
    expect(app.tokenHash).not.toBe(r.token); // only the hash is stored
    expect(app.tokenExpiresAt.getTime()).toBeGreaterThan(NOW.getTime());

    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "adm.application.submit" },
    });
    expect(audit.actorType).toBe("PUBLIC");
    expect(audit.ip).toBeNull(); // no IP address is stored
    expect(JSON.stringify(audit.after)).not.toContain("Hoxha");

    const mail = await db.emailOutbox.findFirstOrThrow();
    expect(mail).toMatchObject({ toAddress: "Ana@Example.com", type: "adm.application-received" });
    expect(mail.subject).toContain(r.reference);
    expect(mail.text).toContain(`/apply/status/${r.token}`);
    expect(mail.userId).toBeNull();
  });

  it("e-mails in the language of the form", async () => {
    await submitOk({ locale: "en", email: "en@example.com" });
    const mail = await db.emailOutbox.findFirstOrThrow();
    expect(mail.subject).toContain("was received");
  });

  it("refuses closed cycles, inactive programs, bad values and consent", async () => {
    const early = await applications.submitApplication(
      form(),
      IP,
      new Date("2026-05-31T10:00:00Z"),
    );
    expect(early).toMatchObject({ ok: false, errors: { cycleId: "cycleClosed" } });
    await db.studyProgram.update({ where: { id: progId }, data: { active: false } });
    expect(await submit()).toMatchObject({
      ok: false,
      errors: { programId: "programUnavailable" },
    });
    await db.studyProgram.update({ where: { id: progId }, data: { active: true } });
    expect(await submit({ averageGrade: "11" })).toMatchObject({
      ok: false,
      errors: { averageGrade: "invalidGrade" },
    });
    expect(await submit({ consent: false })).toMatchObject({
      ok: false,
      errors: { consent: "consentRequired" },
    });
    expect(await submit({ email: "nope" })).toMatchObject({
      ok: false,
      errors: { email: "invalidEmail" },
    });
    expect(await db.application.count()).toBe(0);
    expect(await db.emailOutbox.count()).toBe(0);
  });

  it("refuses the same e-mail for the same program and cycle, in any letter case", async () => {
    await submitOk();
    const again = await submit({ email: "ANA@example.COM" });
    expect(again).toMatchObject({ ok: false, errors: { email: "duplicate" } });
    expect(await db.application.count()).toBe(1);
  });

  it("answers a filled honeypot like a success and stores nothing", async () => {
    const r = await submit({ hp_note: "spam" });
    expect(r.ok).toBe(true);
    expect(await db.application.count()).toBe(0);
    expect(await db.emailOutbox.count()).toBe(0);
  });

  it("allows 5 submissions per IP and refuses the 6th", async () => {
    for (let i = 0; i < 5; i++) await submitOk({ email: `p${i}@example.com` });
    expect(await submit({ email: "p5@example.com" })).toEqual({ ok: false, code: "RATE_LIMITED" });
    // another address is not affected
    expect((await submit({ email: "p6@example.com" }, "198.51.100.1")).ok).toBe(true);
    expect(await db.application.count()).toBe(6);
  });
});

describe("private link (AC-7, AC-8)", () => {
  it("shows the application with required and missing documents", async () => {
    const { token, reference } = await submitOk();
    const view = (await applications.getApplicationByToken(token, NOW))!;
    expect(view).toMatchObject({ reference, status: "SUBMITTED", canUpload: true });
    expect(view.missing).toEqual(["diploma", "id-card"]);
    expect(view.documents.map((d) => [d.key, d.file])).toEqual([
      ["diploma", null],
      ["id-card", null],
      ["photo", null],
    ]);
  });

  it("answers null for malformed, unknown and expired tokens", async () => {
    const { token } = await submitOk();
    expect(await applications.getApplicationByToken("short", NOW)).toBeNull();
    expect(await applications.getApplicationByToken("a".repeat(43), NOW)).toBeNull();
    const later = new Date(NOW.getTime() + 181 * 24 * 3_600_000);
    expect(await applications.getApplicationByToken(token, later)).toBeNull();
    const justBefore = new Date(NOW.getTime() + 179 * 24 * 3_600_000);
    expect(await applications.getApplicationByToken(token, justBefore)).not.toBeNull();
  });
});

describe("document upload (AC-9)", () => {
  it("stores a file, attaches it to the application and audits it", async () => {
    const { token, reference } = await submitOk();
    expect(await upload(token, "diploma")).toEqual({ ok: true, fileName: "my file.pdf" });
    const view = (await applications.getApplicationByToken(token, NOW))!;
    expect(view.missing).toEqual(["id-card"]);
    expect(view.documents[0]!.file?.name).toBe("my file.pdf");
    const app = await db.application.findUniqueOrThrow({ where: { reference } });
    const file = await db.storedFile.findFirstOrThrow({ where: { entityId: app.id } });
    expect(file).toMatchObject({
      purpose: "application-document",
      status: "ATTACHED",
      entityType: "Application",
      mimeType: "application/pdf",
    });
    expect(await db.auditLog.count({ where: { action: "adm.application.upload" } })).toBe(1);
  });

  it("voids the earlier file of the type and keeps both", async () => {
    const { token } = await submitOk();
    await upload(token, "photo", PNG);
    await upload(token, "photo", PDF);
    const docs = await db.applicationDocument.findMany({ orderBy: { uploadedAt: "asc" } });
    expect(docs).toHaveLength(2);
    expect(docs[0]!.voidedAt).not.toBeNull();
    expect(docs[1]!.voidedAt).toBeNull();
    expect(await db.storedFile.count()).toBe(2);
    const view = (await applications.getApplicationByToken(token, NOW))!;
    expect(view.documents.find((d) => d.key === "photo")?.file).not.toBeNull();
  });

  it("refuses wrong types, unknown keys, empty files, bad tokens and decided applications", async () => {
    const { token, reference } = await submitOk();
    const exe = new TextEncoder().encode("MZ not a document");
    expect(await upload(token, "diploma", exe)).toEqual({ ok: false, code: "UNSUPPORTED_TYPE" });
    expect(await upload(token, "diploma", new Uint8Array())).toEqual({ ok: false, code: "EMPTY" });
    expect(await upload(token, "nope")).toEqual({ ok: false, code: "UNKNOWN_DOCUMENT" });
    expect(await upload("a".repeat(43), "diploma")).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(
      await applications.uploadDocument(
        token,
        "diploma",
        { name: "x.pdf", type: "image/png", bytes: PDF },
        IP,
        NOW,
      ),
    ).toEqual({ ok: false, code: "TYPE_MISMATCH" });
    await db.application.update({ where: { reference }, data: { status: "ACCEPTED" } });
    expect(await upload(token, "diploma")).toEqual({ ok: false, code: "CLOSED" });
    expect(await db.storedFile.count()).toBe(0);
  });

  it("limits uploads to 30 per IP", async () => {
    const { token } = await submitOk();
    for (let i = 0; i < 30; i++) expect((await upload(token, "photo", PNG)).ok).toBe(true);
    expect(await upload(token, "photo", PNG)).toEqual({ ok: false, code: "RATE_LIMITED" });
  });
});

describe("new link (AC-10)", () => {
  it("rotates the token when reference and e-mail match and mails the new link", async () => {
    const { token, reference } = await submitOk();
    expect(
      await applications.requestNewLink({ reference, email: "ana@EXAMPLE.com" }, IP, NOW),
    ).toEqual({
      ok: true,
    });
    expect(await applications.getApplicationByToken(token, NOW)).toBeNull();
    const mails = await db.emailOutbox.findMany({
      where: { type: "adm.link-reissued" },
    });
    expect(mails).toHaveLength(1);
    const fresh = mails[0]!.text.match(/\/apply\/status\/([A-Za-z0-9_-]{43})/)?.[1];
    expect(fresh).toBeTruthy();
    expect((await applications.getApplicationByToken(fresh!, NOW))?.reference).toBe(reference);
  });

  it("answers the same when nothing matches and changes nothing", async () => {
    const { token, reference } = await submitOk();
    expect(
      await applications.requestNewLink({ reference, email: "other@example.com" }, IP, NOW),
    ).toEqual({
      ok: true,
    });
    expect(
      await applications.requestNewLink(
        { reference: "AP-NOPE", email: "ana@example.com" },
        IP,
        NOW,
      ),
    ).toEqual({
      ok: true,
    });
    expect(await applications.getApplicationByToken(token, NOW)).not.toBeNull();
    expect(await db.emailOutbox.count({ where: { type: "adm.link-reissued" } })).toBe(0);
  });

  it("is rate limited and validates the form", async () => {
    expect(await applications.requestNewLink({ reference: "", email: "" }, IP, NOW)).toEqual({
      ok: false,
      code: "VALIDATION",
    });
    for (let i = 0; i < 4; i++)
      await applications.requestNewLink({ reference: "AP-X", email: "a@b.co" }, IP, NOW);
    expect(
      await applications.requestNewLink({ reference: "AP-X", email: "a@b.co" }, IP, NOW),
    ).toEqual({
      ok: false,
      code: "RATE_LIMITED",
    });
  });
});

describe("staff list and permissions (AC-11, AC-12)", () => {
  it("lists applications with filters and counts missing required documents", async () => {
    const a = await submitOk();
    await submitOk({ email: "b@example.com", firstName: "Besa", lastName: "Dema" });
    await upload(a.token, "diploma");
    const all = await applicationsTable.fetch(
      {
        page: 1,
        pageSize: 25,
        sort: { key: "submittedAt", dir: "desc" },
        filters: {},
        columns: [],
      },
      { user: { id: "sec" } },
    );
    expect(all.total).toBe(2);
    const row = all.rows.find((r) => r.reference === a.reference)!;
    expect(row).toMatchObject({ program: "P1", cycle: "Round 1", status: "SUBMITTED", missing: 1 });
    expect(all.rows.find((r) => r.reference !== a.reference)!.missing).toBe(2);

    const filtered = await applicationsTable.fetch(
      {
        page: 1,
        pageSize: 25,
        sort: { key: "name", dir: "asc" },
        filters: { name: "dema", status: "SUBMITTED" },
        columns: [],
      },
      { user: { id: "sec" } },
    );
    expect(filtered.rows.map((r) => r.name)).toEqual(["Dema Besa"]);
  });

  it("grants read to secretary, student affairs, finance and sysadmin; write to the first two", async () => {
    const roles = ["secretary", "student_affairs", "finance", "sysadmin", "lecturer", "student"];
    for (const role of roles) {
      await db.user.create({ data: { id: role, email: `${role}@t.test`, name: role } });
      await db.userRole.create({
        data: { userId: role, role: role as never, scopeType: "INSTITUTION", scopeId: null },
      });
    }
    const can3 = async (role: string, p: string) => can({ id: role }, p as never);
    for (const role of ["secretary", "student_affairs", "finance", "sysadmin"]) {
      expect(await can3(role, "adm.application.read")).toBe(true);
      expect(await can3(role, "adm.cycle.read")).toBe(true);
    }
    expect(await can3("secretary", "adm.cycle.write")).toBe(true);
    expect(await can3("student_affairs", "adm.cycle.write")).toBe(true);
    for (const role of ["finance", "sysadmin", "lecturer", "student"])
      expect(await can3(role, "adm.cycle.write")).toBe(false);
    for (const role of ["lecturer", "student"])
      expect(await can3(role, "adm.application.read")).toBe(false);
    // nobody can upload with the file purpose through /api/files
    for (const role of roles) expect(await can3(role, "adm.application.upload")).toBe(false);
  });

  it("the file purpose is readable only with adm.application.read", async () => {
    await db.user.create({ data: { id: "fin", email: "fin@t.test", name: "fin" } });
    await db.userRole.create({
      data: { userId: "fin", role: "finance", scopeType: "INSTITUTION", scopeId: null },
    });
    await db.user.create({ data: { id: "stu", email: "stu@t.test", name: "stu" } });
    await db.userRole.create({
      data: { userId: "stu", role: "student", scopeType: "INSTITUTION", scopeId: null },
    });
    const { token, reference } = await submitOk();
    await upload(token, "diploma");
    const app = await db.application.findUniqueOrThrow({ where: { reference } });
    const file = await db.storedFile.findFirstOrThrow({ where: { entityId: app.id } });
    const { openFile } = await import("@/lib/files/files.service");
    expect(await openFile({ id: "fin" }, file.id)).not.toBeNull();
    expect(await openFile({ id: "stu" }, file.id)).toBeNull();
  });
});
