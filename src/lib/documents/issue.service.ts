import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { DomainError, type ActionContext } from "@/lib/actions";
import { env } from "@/lib/env";
import { zonedDay } from "@/lib/i18n/zone";
import { getStorage } from "@/lib/storage";
import { newStorageKey } from "@/lib/storage/storage";
import { getConverter, PdfUnavailableError, type PdfConverter } from "./gotenberg";
import { qrSvg } from "./qr";
import { findTemplate } from "./template.service";
import { formatNumber, renderTemplate } from "./template";
import { getDocumentType } from "./types";

type Ctx = ActionContext;

export const FILE_PURPOSE = "issued-document";

export type IssueInput = {
  type: string;
  language: string;
  data: Record<string, unknown>;
  subject?: { type: string; id: string } | null;
  /**
   * Runs on the converted PDF before it is hashed and stored (e.g. CUR-06 appends the syllabi), so
   * the stored SHA-256 is that of the final file. A failure rolls the number back like a failed
   * conversion.
   */
  finalize?: (pdf: Uint8Array) => Promise<Uint8Array>;
};

/** 24 random bytes as base64url: unguessable, URL-safe. */
const newVerifyCode = (): string => randomBytes(18).toString("base64url");

export const verifyUrl = (code: string): string =>
  `${env.APP_URL.replace(/\/$/, "")}/verify/${code}`;

/** AC-5: the next number of the type in the year; the row lock serializes concurrent issuers. */
export async function nextNumber(
  db: Ctx["db"],
  type: string,
  year: number,
): Promise<{ number: string; sequence: number }> {
  const def = getDocumentType(type);
  if (!def) throw new DomainError("VALIDATION", "Unknown type", { type: ["unknownType"] });
  const rows = await db.$queryRaw<{ last: number }[]>`
    INSERT INTO document_counters (type, year, last) VALUES (${type}, ${year}, 1)
    ON CONFLICT (type, year) DO UPDATE SET last = document_counters.last + 1
    RETURNING last`;
  const sequence = rows[0]!.last;
  return { number: formatNumber(def.prefix, year, sequence), sequence };
}

/** AC-2/AC-6: the variables every template receives, merged under the module's own data. */
export async function renderDocument(
  html: string,
  data: Record<string, unknown>,
  vars: { number: string; issuedDate: string; verifyCode: string },
): Promise<string> {
  const url = verifyUrl(vars.verifyCode);
  return renderTemplate(html, {
    ...data,
    number: vars.number,
    issuedDate: vars.issuedDate,
    verifyUrl: url,
    qr: await qrSvg(url),
  });
}

/**
 * AC-3..AC-6: pick the template, number, render, convert, store, record - in the caller's
 * transaction, so a failed conversion rolls the number back (no gaps from errors).
 */
export async function issueDocument(
  ctx: Ctx,
  input: IssueInput,
  convert: PdfConverter = getConverter(),
) {
  const def = getDocumentType(input.type);
  if (!def) throw new DomainError("VALIDATION", "Unknown type", { type: ["unknownType"] });
  const now = new Date();
  const today = zonedDay(now);
  const template = await findTemplate(ctx.db, input.type, input.language, today);
  if (!template) throw new DomainError("NOT_FOUND", "NO_TEMPLATE");

  const year = Number(today.slice(0, 4));
  const { number } = await nextNumber(ctx.db, input.type, year);
  const verifyCode = newVerifyCode();
  const html = await renderDocument(template.html, input.data, {
    number,
    issuedDate: today,
    verifyCode,
  });

  let pdf: Uint8Array;
  try {
    pdf = await convert(html);
  } catch (error) {
    if (error instanceof PdfUnavailableError)
      throw new DomainError("UNAVAILABLE", "PDF conversion unavailable");
    throw error;
  }
  if (input.finalize) pdf = await input.finalize(pdf);

  const fileId = randomBytes(12).toString("hex");
  const storageKey = newStorageKey(fileId, now);
  const sha256 = createHash("sha256").update(pdf).digest("hex");
  const storage = getStorage();
  await storage.put(storageKey, pdf);
  // if the transaction does not commit, take the bytes away again
  ctx.onFailure(() => storage.delete(storageKey));

  const issued = await ctx.db.issuedDocument.create({
    data: {
      type: input.type,
      number,
      templateId: template.id,
      language: input.language,
      fileId,
      sha256,
      verifyCode,
      subjectType: input.subject?.type ?? null,
      subjectId: input.subject?.id ?? null,
      issuedAt: now,
      issuedById: ctx.user.id,
    },
  });
  await ctx.db.storedFile.create({
    data: {
      id: fileId,
      storageKey,
      purpose: FILE_PURPOSE,
      fileName: `${number}.pdf`,
      mimeType: "application/pdf",
      size: pdf.length,
      sha256,
      status: "ATTACHED",
      entityType: "IssuedDocument",
      entityId: issued.id,
      attachedAt: now,
      uploadedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "plt.document.issue",
    entityType: "IssuedDocument",
    entityId: issued.id,
    before: null,
    after: {
      type: input.type,
      number,
      templateVersion: template.version,
      language: input.language,
      sha256,
    },
  });
  return { documentId: issued.id, number, fileId, verifyCode };
}

/** AC-9: the file and number stay; only the cancellation is recorded. */
export async function cancelDocument(ctx: Ctx, id: string) {
  const reason = ctx.reason?.trim();
  if (!reason) throw new DomainError("VALIDATION", "Reason required", { reason: ["required"] });
  const doc = await ctx.db.issuedDocument.findUnique({ where: { id } });
  if (!doc) throw new DomainError("NOT_FOUND", "Document not found");
  if (doc.cancelledAt) throw new DomainError("CONFLICT", "Already cancelled");
  await ctx.db.issuedDocument.update({
    where: { id },
    data: { cancelledAt: new Date(), cancelledById: ctx.user.id, cancelReason: reason },
  });
  await ctx.audit({
    action: "plt.document.cancel",
    entityType: "IssuedDocument",
    entityId: id,
    before: { cancelled: false },
    after: { cancelled: true, number: doc.number },
    reason,
  });
}
