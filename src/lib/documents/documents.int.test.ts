import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import { LocalStorage, setStorage } from "@/lib/storage";
import { gotenbergConverter, PdfUnavailableError } from "./gotenberg";
import { cancelDocument, issueDocument } from "./issue.service";
import { getVerification } from "./queries";
import * as templates from "./template.service";
import { registerDocumentType, resetDocumentTypes, registerSampleType, SAMPLE_TYPE } from "./types";

const actor = { id: "admin-1", email: "a@t.test", name: "Admin", locale: null, personId: null };
function run<R>(fn: (ctx: ActionContext) => Promise<R>, reason?: string): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => actor,
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "plt.document.manage",
    input: z.object({}).passthrough(),
    requireReason: reason !== undefined,
    handler: (_i, ctx) => fn(ctx),
  })({ reason } as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};

const fakePdf = async (html: string) => new TextEncoder().encode(`%PDF-fake ${html}`);
const html = "<h1>{{title}}</h1><p>{{number}} {{issuedDate}}</p>{{{qr}}}<a>{{verifyUrl}}</a>";
const input = (over: Partial<templates.TemplateInput> = {}): templates.TemplateInput => ({
  language: "sq",
  validFrom: "2020-01-01",
  html,
  ...over,
});
const published = async (over: Partial<templates.TemplateInput> = {}, type = SAMPLE_TYPE) => {
  const { templateId } = ok(await run((c) => templates.createDraft(c, type, input(over))));
  ok(await run((c) => templates.publish(c, templateId)));
  return templateId;
};
const issue = (data: Record<string, unknown> = { title: "Provë" }, language = "sq") =>
  run((c) => issueDocument(c, { type: SAMPLE_TYPE, language, data }, fakePdf));

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "docs-"));
  setStorage(new LocalStorage(dir));
  registerSampleType();
});
afterAll(async () => {
  setStorage(undefined);
  await rm(dir, { recursive: true, force: true });
});
beforeEach(async () => {
  for (const t of ["document_templates", "issued_documents"])
    await db.$executeRawUnsafe(`ALTER TABLE "${t}" DISABLE TRIGGER USER`);
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE "audit_logs", "issued_documents", "document_counters", "document_templates", "stored_files" CASCADE`,
  );
  for (const t of ["document_templates", "issued_documents"])
    await db.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE TRIGGER USER`);
});

describe("templates (AC-1, AC-3)", () => {
  it("versions per type and language", async () => {
    const a = ok(await run((c) => templates.createDraft(c, SAMPLE_TYPE, input())));
    const b = ok(await run((c) => templates.createDraft(c, SAMPLE_TYPE, input())));
    const en = ok(
      await run((c) => templates.createDraft(c, SAMPLE_TYPE, input({ language: "en" }))),
    );
    expect([a.version, b.version, en.version]).toEqual([1, 2, 1]);
  });
  it("validates the draft", async () => {
    const r = await run((c) =>
      templates.createDraft(
        c,
        SAMPLE_TYPE,
        input({ html: "{{#if x}}", language: "de", validFrom: "x" }),
      ),
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(Object.keys(r.error.fieldErrors ?? {}).sort()).toEqual([
        "html",
        "language",
        "validFrom",
      ]);
    const unknown = await run((c) => templates.createDraft(c, "nope.type", input()));
    expect(unknown.ok).toBe(false);
  });
  it("edits only drafts and freezes published ones in the database", async () => {
    const { templateId } = ok(await run((c) => templates.createDraft(c, SAMPLE_TYPE, input())));
    ok(await run((c) => templates.updateDraft(c, templateId, input({ html: "<p>x</p>" }))));
    ok(await run((c) => templates.publish(c, templateId)));
    const edit = await run((c) => templates.updateDraft(c, templateId, input()));
    expect(!edit.ok && edit.error.code).toBe("CONFLICT");
    await expect(
      db.documentTemplate.update({ where: { id: templateId }, data: { html: "hack" } }),
    ).rejects.toThrow();
    ok(await run((c) => templates.archive(c, templateId)));
    await expect(
      db.documentTemplate.update({ where: { id: templateId }, data: { status: "PUBLISHED" } }),
    ).rejects.toThrow();
  });
  it("picks the valid published template, latest version first", async () => {
    await published({ validFrom: "2020-01-01", validTo: "2020-12-31", html: "old" });
    const v2 = await published({ validFrom: "2021-01-01", html: "<b>v2</b>" });
    const v3 = await published({ validFrom: "2021-01-01", html: "<b>v3</b>" });
    await run((c) => templates.createDraft(c, SAMPLE_TYPE, input({ html: "draft" }))); // never picked
    await published({ language: "en", html: "english" });
    const find = (lang: string, on: string) =>
      db.$transaction((tx) => templates.findTemplate(tx, SAMPLE_TYPE, lang, on));
    expect((await find("sq", "2020-06-01"))?.html).toBe("old");
    expect((await find("sq", "2021-06-01"))?.id).toBe(v3);
    expect(v2).not.toBe(v3);
    expect((await find("en", "2021-06-01"))?.html).toBe("english");
    expect(await find("sq", "2019-01-01")).toBeNull();
  });
});

describe("issuing (AC-4, AC-5, AC-6, AC-7)", () => {
  it("fails with NO_TEMPLATE when none is valid", async () => {
    const r = await issue();
    expect(!r.ok && r.error.message).toBe("NO_TEMPLATE");
    expect(await db.documentCounter.count()).toBe(0);
  });
  it("numbers, stores and records the document", async () => {
    await published();
    const a = ok(await issue({ title: "<Ana>" }));
    const b = ok(await issue());
    const year = new Date().getUTCFullYear();
    expect(a.number).toBe(`TEST-${year}-00001`);
    expect(b.number).toBe(`TEST-${year}-00002`);
    const doc = await db.issuedDocument.findUniqueOrThrow({ where: { id: a.documentId } });
    const file = await db.storedFile.findUniqueOrThrow({ where: { id: doc.fileId } });
    expect(file).toMatchObject({
      purpose: "issued-document",
      status: "ATTACHED",
      entityId: doc.id,
      sha256: doc.sha256,
    });
    const bytes = new TextDecoder().decode(await new LocalStorage(dir).read(file.storageKey));
    expect(bytes).toContain("&lt;Ana&gt;");
    expect(bytes).toContain(a.number);
    expect(bytes).toContain(`/verify/${a.verifyCode}`);
    expect(bytes).toContain("<svg");
    expect(await db.auditLog.count({ where: { action: "plt.document.issue" } })).toBe(2);
  });
  it("numbers per type and year independently", async () => {
    registerDocumentType({ type: "plt.other", prefix: "OTH", sampleData: {} });
    await published();
    await published({}, "plt.other");
    ok(await issue());
    const r = ok(
      await run((c) => issueDocument(c, { type: "plt.other", language: "sq", data: {} }, fakePdf)),
    );
    expect(r.number).toMatch(/^OTH-\d{4}-00001$/);
    resetDocumentTypes();
    registerSampleType();
  });
  it("gives unique numbers under concurrency", async () => {
    await published();
    const results = await Promise.all(Array.from({ length: 8 }, () => issue()));
    const numbers = results.map((r) => ok(r).number);
    expect(new Set(numbers).size).toBe(8);
    expect(await db.issuedDocument.count()).toBe(8);
    expect((await db.documentCounter.findFirstOrThrow()).last).toBe(8);
  });
  it("issues nothing, uses no number and leaves no file when conversion fails", async () => {
    await published();
    const r = await run((c) =>
      issueDocument(c, { type: SAMPLE_TYPE, language: "sq", data: {} }, async () => {
        throw new PdfUnavailableError();
      }),
    );
    expect(!r.ok && r.error.code).toBe("UNAVAILABLE");
    expect(await db.issuedDocument.count()).toBe(0);
    expect(await db.documentCounter.count()).toBe(0);
    expect(await db.storedFile.count()).toBe(0);
  });
  it("removes the stored object if the transaction fails afterwards", async () => {
    await published();
    const r = await run(async (c) => {
      await issueDocument(c, { type: SAMPLE_TYPE, language: "sq", data: {} }, fakePdf);
      throw new Error("boom");
    });
    expect(r.ok).toBe(false);
    expect(await db.issuedDocument.count()).toBe(0);
    expect(await db.documentCounter.count()).toBe(0);
  });
  it("never edits or deletes an issued document", async () => {
    await published();
    const { documentId } = ok(await issue());
    await expect(
      db.issuedDocument.update({ where: { id: documentId }, data: { number: "X" } }),
    ).rejects.toThrow();
    await expect(db.issuedDocument.delete({ where: { id: documentId } })).rejects.toThrow();
    await expect(
      db.documentTemplate.delete({
        where: { id: (await db.documentTemplate.findFirstOrThrow()).id },
      }),
    ).rejects.toThrow();
  });
});

describe("verification and cancellation (AC-8, AC-9)", () => {
  it("shows only type, number, date and status; unknown or malformed codes give null", async () => {
    await published();
    const { verifyCode, number } = ok(await issue());
    const v = await getVerification(verifyCode);
    expect(v).toMatchObject({ type: SAMPLE_TYPE, number, status: "valid" });
    expect(Object.keys(v!).sort()).toEqual(["issuedAt", "number", "status", "type"]);
    expect(await getVerification("a".repeat(24))).toBeNull();
    expect(await getVerification("../etc")).toBeNull();
  });
  it("cancels with a reason, keeps file and number", async () => {
    await published();
    const { documentId, verifyCode } = ok(await issue());
    const noReason = await run((c) => cancelDocument(c, documentId));
    expect(noReason.ok).toBe(false);
    ok(await run((c) => cancelDocument(c, documentId), "Gabim në të dhëna"));
    expect((await getVerification(verifyCode))?.status).toBe("cancelled");
    const doc = await db.issuedDocument.findUniqueOrThrow({ where: { id: documentId } });
    expect(doc.cancelReason).toBe("Gabim në të dhëna");
    expect(await db.storedFile.count({ where: { id: doc.fileId, deletedAt: null } })).toBe(1);
    const again = await run((c) => cancelDocument(c, documentId), "x");
    expect(!again.ok && again.error.code).toBe("CONFLICT");
    expect(await db.auditLog.count({ where: { action: "plt.document.cancel" } })).toBe(1);
  });
});

describe("real Gotenberg (AC-4)", () => {
  it("converts HTML to a PDF when the service is reachable", async (ctx) => {
    const url = process.env.GOTENBERG_URL ?? "http://localhost:3001";
    const up = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) })
      .then((r) => r.ok)
      .catch(() => false);
    if (!up) return ctx.skip();
    const pdf = await gotenbergConverter(() => url)("<h1>Ëçëç</h1>");
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  });
  it("reports an unreachable service as unavailable", async () => {
    await expect(gotenbergConverter(() => "http://127.0.0.1:9")("<p/>")).rejects.toBeInstanceOf(
      PdfUnavailableError,
    );
  });
});
